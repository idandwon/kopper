import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyDocument } from "../../shared/domain/document";
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
