import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyDocument, type KopperDocument } from "../../shared/domain/document";
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
      raw: Buffer.from("{broken"),
    });
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
      raw: Buffer.from(malformed),
    });
    expect(await readFile(storePath, "utf8")).toBe(malformed);
  });

  it("persists valid replacements with stable formatting", async () => {
    const repository = new NoteRepository(storePath);
    const loaded = await repository.load();
    expect(loaded.ok).toBe(true);
    const next = changedDocument(repository.snapshot());

    const result = await repository.replace(next);

    expect(result).toEqual({ ok: true, value: next });
    expect(await readFile(storePath, "utf8")).toBe(`${JSON.stringify(next, null, 2)}\n`);
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
