import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEmptyDocument,
  type KopperDocument,
} from "../../shared/domain/document";
import { AtomicReplaceError } from "./atomicFile";
import { NoteRepository } from "./noteRepository";

const timestamp = "2026-08-16T12:00:00.000Z";
let directory: string;
let storePath: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "kopper-repository-"));
  storePath = join(directory, "kopper.json");
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function changedDocument(document: KopperDocument): KopperDocument {
  return {
    ...document,
    window: { ...document.window, pinned: true },
  };
}

describe("NoteRepository", () => {
  it("creates and persists an empty document when the file is absent", async () => {
    const repository = new NoteRepository(storePath);

    const result = await repository.load();

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ notes: [] }),
      created: true,
    });
    expect(JSON.parse(await readFile(storePath, "utf8")).schemaVersion).toBe(1);
  });

  it("loads a valid document without replacing it", async () => {
    const document = createEmptyDocument(new Date(timestamp));
    const serialized = `${JSON.stringify(document, null, 2)}\n`;
    await writeFile(storePath, serialized, "utf8");
    const repository = new NoteRepository(storePath);

    const result = await repository.load();

    expect(result).toEqual({ ok: true, value: document, created: false });
    expect(await readFile(storePath, "utf8")).toBe(serialized);
  });

  it("returns recovery bytes without overwriting malformed JSON", async () => {
    await writeFile(storePath, "{broken", "utf8");
    const repository = new NoteRepository(storePath);

    const result = await repository.load();

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "invalid_document",
        recoveryAction: "choose_file",
      }),
    });
    expect(result).not.toHaveProperty("raw");
    const current = repository.currentResult();
    expect(current).toEqual(result);
    expect(await readFile(storePath, "utf8")).toBe("{broken");
  });

  it("returns recovery bytes without overwriting a document that fails validation", async () => {
    const malformed = JSON.stringify({ schemaVersion: 1, notes: [] });
    await writeFile(storePath, malformed, "utf8");
    const repository = new NoteRepository(storePath);

    const result = await repository.load();

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "invalid_document",
        recoveryAction: "choose_file",
      }),
    });
    expect(result).not.toHaveProperty("raw");
    const current = repository.currentResult();
    expect(current).toEqual(result);
    expect(await readFile(storePath, "utf8")).toBe(malformed);
  });

  it("persists valid replacements with stable formatting", async () => {
    const repository = new NoteRepository(storePath);
    const loaded = await repository.load();
    expect(loaded.ok).toBe(true);
    const next = changedDocument(repository.snapshot());

    const result = await repository.replace(next);

    expect(result).toEqual({ ok: true, value: next });
    expect(await readFile(storePath, "utf8")).toBe(
      `${JSON.stringify(next, null, 2)}\n`,
    );
    expect(repository.snapshot()).toEqual(next);
  });

  it("does not update the snapshot when persistence fails", async () => {
    const failingAtomicReplace = vi.fn(async (): Promise<void> => {
      throw new Error("disk full");
    });
    const repository = new NoteRepository(storePath, failingAtomicReplace);
    const before = repository.snapshot();
    const next = changedDocument(before);

    const result = await repository.replace(next);

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "write_failed", retryable: true }),
    });
    expect(repository.snapshot()).toEqual(before);
  });

  it("serializes overlapping validation, writes, and snapshot updates", async () => {
    const initial = createEmptyDocument(new Date(timestamp));
    await writeFile(storePath, `${JSON.stringify(initial, null, 2)}\n`, "utf8");

    let releaseFirstWrite: (() => void) | undefined;
    const firstWriteReleased = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    let signalFirstWriteStarted: (() => void) | undefined;
    const firstWriteStarted = new Promise<void>((resolve) => {
      signalFirstWriteStarted = resolve;
    });
    const writer = vi.fn(async (path: string, contents: string) => {
      if (writer.mock.calls.length === 1) {
        signalFirstWriteStarted?.();
        await firstWriteReleased;
      }
      await writeFile(path, contents, "utf8");
    });
    const repository = new NoteRepository(storePath, writer);
    expect((await repository.load()).ok).toBe(true);
    const first = changedDocument(repository.snapshot());
    const second: KopperDocument = {
      ...first,
      window: {
        pinned: false,
        bounds: { x: 10, y: 20, width: 380, height: 640 },
      },
    };

    const firstReplacement = repository.replace(first);
    await firstWriteStarted;
    const secondReplacement = repository.replace(second);
    await Promise.resolve();

    expect(writer).toHaveBeenCalledTimes(1);
    releaseFirstWrite?.();
    await expect(firstReplacement).resolves.toEqual({ ok: true, value: first });
    await expect(secondReplacement).resolves.toEqual({
      ok: true,
      value: second,
    });
    expect(writer).toHaveBeenCalledTimes(2);
    expect(repository.snapshot()).toEqual(second);
    expect(JSON.parse(await readFile(storePath, "utf8"))).toEqual(second);
  });

  it("reconciles a committed destination after a post-rename error", async () => {
    const initial = createEmptyDocument(new Date(timestamp));
    await writeFile(storePath, `${JSON.stringify(initial, null, 2)}\n`, "utf8");
    const writer = vi.fn(async (path: string, contents: string) => {
      await writeFile(path, contents, "utf8");
      throw new AtomicReplaceError(
        "after_rename",
        new Error("directory sync failed"),
      );
    });
    const repository = new NoteRepository(storePath, writer);
    expect((await repository.load()).ok).toBe(true);
    const next = changedDocument(repository.snapshot());

    await expect(repository.replace(next)).resolves.toEqual({
      ok: true,
      value: next,
    });
    expect(repository.snapshot()).toEqual(next);
    const current = repository.currentResult();
    expect(current).toEqual({ ok: true, value: next });
  });

  it("latches a non-retryable write error when post-rename reconciliation mismatches", async () => {
    const initial = createEmptyDocument(new Date(timestamp));
    await writeFile(storePath, `${JSON.stringify(initial, null, 2)}\n`, "utf8");
    const mismatched: KopperDocument = {
      ...initial,
      window: {
        pinned: false,
        bounds: { x: 10, y: 20, width: 380, height: 640 },
      },
    };
    const writer = vi
      .fn<(path: string, contents: string) => Promise<void>>()
      .mockImplementationOnce(async (path) => {
        await writeFile(
          path,
          `${JSON.stringify(mismatched, null, 2)}\n`,
          "utf8",
        );
        throw new AtomicReplaceError(
          "after_rename",
          new Error("directory sync failed"),
        );
      })
      .mockImplementation(async (path, contents) => {
        await writeFile(path, contents, "utf8");
      });
    const repository = new NoteRepository(storePath, writer);
    expect((await repository.load()).ok).toBe(true);
    const intended = changedDocument(repository.snapshot());

    const uncertain = await repository.replace(intended);
    expect(uncertain).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "write_failed",
        retryable: false,
      }),
    });
    const current = repository.currentResult();
    expect(current).toEqual(uncertain);

    await expect(repository.replace(intended)).resolves.toEqual(uncertain);
    expect(writer).toHaveBeenCalledTimes(1);

    await expect(repository.load()).resolves.toEqual({
      ok: true,
      value: mismatched,
      created: false,
    });
    await expect(repository.replace(intended)).resolves.toEqual({
      ok: true,
      value: intended,
    });
    expect(writer).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: "an unreadable destination",
      breakDestination: async (path: string) => {
        await rm(path);
        await mkdir(path);
      },
      expectedLoadCode: "read_failed",
    },
    {
      name: "malformed JSON",
      breakDestination: async (path: string) =>
        writeFile(path, "{broken", "utf8"),
      expectedLoadCode: "invalid_document",
    },
    {
      name: "a schema-invalid document",
      breakDestination: async (path: string) =>
        writeFile(
          path,
          JSON.stringify({ schemaVersion: 1, notes: [] }),
          "utf8",
        ),
      expectedLoadCode: "invalid_document",
    },
    {
      name: "a missing destination",
      breakDestination: async (path: string) => rm(path),
      expectedLoadCode: "write_failed",
    },
  ])(
    "preserves post-rename uncertainty across reload failure from $name",
    async ({ breakDestination, expectedLoadCode }) => {
      const initial = createEmptyDocument(new Date(timestamp));
      await writeFile(
        storePath,
        `${JSON.stringify(initial, null, 2)}\n`,
        "utf8",
      );
      const mismatched: KopperDocument = {
        ...initial,
        window: {
          pinned: false,
          bounds: { x: 10, y: 20, width: 380, height: 640 },
        },
      };
      const writer = vi.fn(async (path: string) => {
        await writeFile(
          path,
          `${JSON.stringify(mismatched, null, 2)}\n`,
          "utf8",
        );
        throw new AtomicReplaceError(
          "after_rename",
          new Error("directory sync failed"),
        );
      });
      const repository = new NoteRepository(storePath, writer);
      expect((await repository.load()).ok).toBe(true);
      const intended = changedDocument(repository.snapshot());
      const uncertain = await repository.replace(intended);
      expect(uncertain).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: "write_failed",
          retryable: false,
        }),
      });
      expect(writer).toHaveBeenCalledTimes(1);

      await breakDestination(storePath);
      await expect(repository.load()).resolves.toEqual({
        ok: false,
        error: expect.objectContaining({ code: expectedLoadCode }),
      });
      await expect(repository.replace(intended)).resolves.toEqual(uncertain);
      expect(writer).toHaveBeenCalledTimes(1);
    },
  );

  it("validates a replacement before invoking the atomic writer", async () => {
    const writer = vi.fn(async (): Promise<void> => undefined);
    const repository = new NoteRepository(storePath, writer);
    const before = repository.snapshot();
    const invalid = { ...before, activeSectionId: "missing" };

    const result = await repository.replace(invalid);

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_document" }),
    });
    expect(writer).not.toHaveBeenCalled();
    expect(repository.snapshot()).toEqual(before);
  });

  it("returns cloned values instead of exposing its snapshot", async () => {
    const repository = new NoteRepository(storePath);
    const loaded = await repository.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    loaded.value.notes.push({} as never);
    const firstSnapshot = repository.snapshot();
    firstSnapshot.sections[0].title = "Changed outside";

    expect(repository.snapshot().notes).toEqual([]);
    expect(repository.snapshot().sections[0].title).toBe("Inbox");
  });
});
