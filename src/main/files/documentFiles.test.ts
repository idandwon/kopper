import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createEmptyDocument,
  type KopperDocument,
} from "../../shared/domain/document";
import { OXIDE_LEDGER_THEME } from "../../shared/theme/presets";
import { CommandService } from "../domain/commandService";
import { MainOperationCoordinator } from "../domain/mainOperationCoordinator";
import { NoteRepository } from "../persistence/noteRepository";
import { DocumentFiles, type DocumentDialog } from "./documentFiles.js";

const directories: string[] = [];
const timestamp = "2026-08-16T12:00:00.000Z";

function dialog(overrides: Partial<DocumentDialog> = {}): DocumentDialog {
  return {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
    showSaveDialog: vi.fn().mockResolvedValue({ canceled: true }),
    ...overrides,
  };
}

function noteDocument(body: string, sectionTitle: string): KopperDocument {
  const document = createEmptyDocument(new Date(timestamp));
  document.sections[0].id = "inbox";
  document.sections[0].title = sectionTitle;
  document.activeSectionId = "inbox";
  document.notes = [
    {
      id: "note-1",
      sectionId: "inbox",
      body,
      order: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
      previousPlacement: null,
    },
  ];
  return document;
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "kopper-files-"));
  directories.push(directory);
  const storePath = join(directory, "kopper.json");
  const repository = new NoteRepository(storePath);
  await repository.replace(createEmptyDocument(new Date(timestamp)));
  return { directory, storePath, repository };
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("DocumentFiles", () => {
  it("exports a pretty-printed validated snapshot and treats cancel as success", async () => {
    const { directory, repository } = await fixture();
    const exportPath = join(directory, "export.json");
    const files = new DocumentFiles(repository, dialog({
      showSaveDialog: vi.fn()
        .mockResolvedValueOnce({ canceled: false, filePath: exportPath })
        .mockResolvedValueOnce({ canceled: true }),
    }));

    await expect(files.exportData()).resolves.toEqual({
      ok: true,
      value: { cancelled: false, fileName: basename(exportPath) },
    });
    expect(await readFile(exportPath, "utf8")).toBe(`${JSON.stringify(repository.snapshot(), null, 2)}\n`);
    await expect(files.exportData()).resolves.toEqual({
      ok: true,
      value: { cancelled: true },
    });
    await expect(files.chooseImport()).resolves.toEqual({
      ok: true,
      value: null,
    });
  });

  it("previews a valid import without replacing until one-use confirmation", async () => {
    const { directory, repository } = await fixture();
    const imported = createEmptyDocument(new Date(timestamp));
    imported.sections[0].title = "Imported";
    const importPath = join(directory, "chosen.json");
    await writeFile(importPath, JSON.stringify(imported), "utf8");
    const replace = vi.spyOn(repository, "replace");
    const files = new DocumentFiles(repository, dialog({
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [importPath] }),
    }));

    const preview = await files.chooseImport();
    expect(preview).toMatchObject({
      ok: true,
      value: { fileName: "chosen.json", noteCount: 0, sectionCount: 1 },
    });
    expect(replace).not.toHaveBeenCalled();
    if (!preview.ok || preview.value === null) return;

    await expect(files.confirmImport(preview.value.token)).resolves.toEqual({ ok: true, value: imported });
    expect(replace).toHaveBeenCalledOnce();
    await expect(files.confirmImport(preview.value.token)).resolves.toMatchObject({
      ok: false,
      error: { code: "validation_failed" },
    });
  });

  it("keeps the source store unchanged when imported native shortcut validation fails", async () => {
    const { directory, storePath, repository } = await fixture();
    const before = repository.snapshot();
    const imported = createEmptyDocument(new Date(timestamp));
    imported.shortcuts = {
      capture: {
        kind: "accelerator",
        accelerator: "CommandOrControl+Alt+Blocked",
      },
      togglePanel: "CommandOrControl+Alt+K",
    };
    const importPath = join(directory, "blocked-shortcut.json");
    await writeFile(importPath, JSON.stringify(imported), "utf8");
    const replaceDocument = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "shortcut_conflict" as const,
        message: "The imported capture shortcut is already in use.",
        retryable: false,
      },
    }));
    const externalReplacementSucceeded = vi.fn();
    const files = new DocumentFiles(
      repository,
      dialog({
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: [importPath],
        }),
      }),
      { replaceDocument, externalReplacementSucceeded },
    );

    const preview = await files.chooseImport();
    if (!preview.ok || preview.value === null) throw new Error("Expected import preview");
    await expect(files.confirmImport(preview.value.token)).resolves.toMatchObject({
      ok: false,
      error: { code: "shortcut_conflict" },
    });

    expect(replaceDocument).toHaveBeenCalledOnce();
    expect(externalReplacementSucceeded).not.toHaveBeenCalled();
    expect(repository.snapshot()).toEqual(before);
    expect(JSON.parse(await readFile(storePath, "utf8"))).toEqual(before);
  });

  it("rejects invalid, unknown, and expired imports without replacing", async () => {
    const { directory, repository } = await fixture();
    const invalidPath = join(directory, "invalid.json");
    await writeFile(invalidPath, "{bad", "utf8");
    const replace = vi.spyOn(repository, "replace");
    const invalidFiles = new DocumentFiles(repository, dialog({
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [invalidPath] }),
    }));
    await expect(invalidFiles.chooseImport()).resolves.toMatchObject({ ok: false, error: { code: "invalid_document" } });
    expect(replace).not.toHaveBeenCalled();
    await expect(invalidFiles.confirmImport("unknown")).resolves.toMatchObject({ ok: false, error: { code: "validation_failed" } });

    const validPath = join(directory, "valid.json");
    await writeFile(validPath, JSON.stringify(repository.snapshot()), "utf8");
    vi.useFakeTimers();
    const expiringFiles = new DocumentFiles(repository, dialog({
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [validPath] }),
    }));
    const preview = await expiringFiles.chooseImport();
    if (!preview.ok || preview.value === null) return;
    vi.advanceTimersByTime(5 * 60_000 + 1);
    await expect(expiringFiles.confirmImport(preview.value.token)).resolves.toMatchObject({ ok: false, error: { code: "validation_failed" } });
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    { name: "an unreadable inactive theme", active: false, reserved: false },
    { name: "an unreadable active theme", active: true, reserved: false },
    { name: "a reserved-ID custom theme", active: true, reserved: true },
  ])("rejects imports containing $name without previewing or replacing", async ({ active, reserved }) => {
    const { directory, repository } = await fixture();
    const before = repository.snapshot();
    const imported = createEmptyDocument(new Date(timestamp));
    const theme = {
      ...structuredClone(OXIDE_LEDGER_THEME),
      id: reserved ? "builtin:collision" : "custom:unreadable",
    };
    if (!reserved) theme.light.foreground = theme.light.background;
    imported.customThemes = [theme];
    if (active) imported.appearance.activeThemeId = theme.id;
    const importPath = join(directory, "invalid-theme-document.json");
    await writeFile(importPath, JSON.stringify(imported), "utf8");
    const replace = vi.spyOn(repository, "replace");
    const files = new DocumentFiles(repository, dialog({
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [importPath] }),
    }));

    await expect(files.chooseImport()).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_document" }),
    });
    expect(replace).not.toHaveBeenCalled();
    expect(repository.snapshot()).toEqual(before);
  });

  it("coordinates import before a later edit so the edit snapshots and preserves imported state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kopper-coordination-"));
    directories.push(directory);
    const storePath = join(directory, "kopper.json");
    const before = noteDocument("Before", "Before section");
    const imported = noteDocument("Imported", "Imported section");
    await writeFile(storePath, `${JSON.stringify(before, null, 2)}\n`, "utf8");
    const importPath = join(directory, "import.json");
    await writeFile(importPath, JSON.stringify(imported), "utf8");

    let releaseImport: (() => void) | undefined;
    const importGate = new Promise<void>((resolve) => {
      releaseImport = resolve;
    });
    let signalImportStarted: (() => void) | undefined;
    const importStarted = new Promise<void>((resolve) => {
      signalImportStarted = resolve;
    });
    const writer = vi.fn(async (path: string, contents: string) => {
      signalImportStarted?.();
      await importGate;
      await writeFile(path, contents, "utf8");
    });
    const repository = new NoteRepository(storePath, writer);
    await repository.load();
    const operations = new MainOperationCoordinator();
    const service = new CommandService(repository, {
      now: () => timestamp,
      createId: () => "generated-id",
      publish: vi.fn(),
    }, operations);
    const files = new DocumentFiles(repository, dialog({
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [importPath] }),
    }), {
      operationCoordinator: operations,
      externalReplacementSucceeded: () => service.clearUndoHistory(),
    });
    const preview = await files.chooseImport();
    if (!preview.ok || preview.value === null) throw new Error("Expected import preview");

    const importing = files.confirmImport(preview.value.token);
    await importStarted;
    const editing = service.execute({ type: "note.edit", noteId: "note-1", body: "Edited after import" });
    await Promise.resolve();
    expect(writer).toHaveBeenCalledTimes(1);

    releaseImport?.();
    await expect(importing).resolves.toEqual({ ok: true, value: imported });
    await expect(editing).resolves.toMatchObject({ ok: true });
    expect(repository.snapshot()).toMatchObject({
      sections: [expect.objectContaining({ title: "Imported section" })],
      notes: [expect.objectContaining({ body: "Edited after import" })],
    });
  });

  it("clears older undo history after successful import and create-new-store replacements", async () => {
    const { directory, repository } = await fixture();
    await repository.replace(noteDocument("Before", "Before section"));
    const imported = noteDocument("Imported", "Imported section");
    const importPath = join(directory, "import.json");
    await writeFile(importPath, JSON.stringify(imported), "utf8");
    const operations = new MainOperationCoordinator();
    const service = new CommandService(repository, {
      now: () => timestamp,
      createId: () => "generated-id",
      publish: vi.fn(),
    }, operations);
    const files = new DocumentFiles(repository, dialog({
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [importPath] }),
    }), {
      operationCoordinator: operations,
      externalReplacementSucceeded: () => service.clearUndoHistory(),
    });

    await service.execute({ type: "note.edit", noteId: "note-1", body: "Edited before import" });
    const preview = await files.chooseImport();
    if (!preview.ok || preview.value === null) throw new Error("Expected import preview");
    await expect(files.confirmImport(preview.value.token)).resolves.toEqual({ ok: true, value: imported });
    await expect(service.undo()).resolves.toMatchObject({ ok: false, error: { message: "There is no document action to undo." } });

    await service.execute({ type: "note.edit", noteId: "note-1", body: "Edited before create" });
    await expect(files.createNewStore()).resolves.toMatchObject({ ok: true });
    await expect(service.undo()).resolves.toMatchObject({ ok: false, error: { message: "There is no document action to undo." } });
  });

  it("retains undo history when an external replacement fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kopper-replacement-failure-"));
    directories.push(directory);
    const storePath = join(directory, "kopper.json");
    const before = noteDocument("Before", "Before section");
    const imported = noteDocument("Imported", "Imported section");
    await writeFile(storePath, `${JSON.stringify(before, null, 2)}\n`, "utf8");
    const importPath = join(directory, "import.json");
    await writeFile(importPath, JSON.stringify(imported), "utf8");
    const writer = vi
      .fn<(path: string, contents: string) => Promise<void>>()
      .mockImplementationOnce(async (path, contents) => {
        await writeFile(path, contents, "utf8");
      })
      .mockRejectedValueOnce(new Error("disk full"))
      .mockImplementationOnce(async (path, contents) => {
        await writeFile(path, contents, "utf8");
      });
    const repository = new NoteRepository(storePath, writer);
    await repository.load();
    const operations = new MainOperationCoordinator();
    const service = new CommandService(repository, {
      now: () => timestamp,
      createId: () => "generated-id",
      publish: vi.fn(),
    }, operations);
    const externalReplacementSucceeded = vi.fn(() => service.clearUndoHistory());
    const files = new DocumentFiles(repository, dialog({
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [importPath] }),
    }), { operationCoordinator: operations, externalReplacementSucceeded });

    await service.execute({ type: "note.edit", noteId: "note-1", body: "Edited" });
    const preview = await files.chooseImport();
    if (!preview.ok || preview.value === null) throw new Error("Expected import preview");
    await expect(files.confirmImport(preview.value.token)).resolves.toMatchObject({
      ok: false,
      error: { code: "write_failed" },
    });
    expect(externalReplacementSucceeded).not.toHaveBeenCalled();
    await expect(service.undo()).resolves.toEqual({ ok: true, value: before });
  });

  it("exports malformed current-store bytes unchanged and only creates a store explicitly", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kopper-recovery-"));
    directories.push(directory);
    const storePath = join(directory, "kopper.json");
    const damaged = Buffer.from([0xff, 0x00, 0x7b, 0x62]);
    await writeFile(storePath, damaged);
    const repository = new NoteRepository(storePath);
    await expect(repository.load()).resolves.toMatchObject({ ok: false });
    expect(await readFile(storePath)).toEqual(damaged);
    const recoveryPath = join(directory, "damaged.bin");
    const files = new DocumentFiles(repository, dialog({
      showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: recoveryPath }),
    }));

    await expect(files.exportRecoveryBytes()).resolves.toMatchObject({ ok: true, value: { cancelled: false } });
    expect(await readFile(recoveryPath)).toEqual(damaged);
    expect(await readFile(storePath)).toEqual(damaged);

    const created = await files.createNewStore();
    expect(created.ok).toBe(true);
    expect(repository.currentResult().ok).toBe(true);
  });
});
