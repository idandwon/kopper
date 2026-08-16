import { describe, expect, it, vi } from "vitest";

import type { DocumentCommand } from "../../shared/domain/commands";
import {
  createEmptyDocument,
  type KopperDocument,
} from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import { CommandService, type CommandRepository } from "./commandService";

const timestamp = "2026-08-16T12:00:00.000Z";
const writeError: KopperError = {
  code: "write_failed",
  message: "The document could not be saved.",
  retryable: true,
  recoveryAction: "retry",
};

function makeDocument(body = "Before"): KopperDocument {
  const document = createEmptyDocument(new Date(timestamp));
  document.sections[0].id = "inbox";
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

function edit(body: string): DocumentCommand {
  return { type: "note.edit", noteId: "note-1", body };
}

function makeService(initial = makeDocument()) {
  let stored = structuredClone(initial);
  const persist = async (
    next: KopperDocument,
  ): Promise<Result<KopperDocument, KopperError>> => {
    stored = structuredClone(next);
    return { ok: true, value: structuredClone(next) };
  };
  const replace = vi.fn(persist);
  const repository: CommandRepository = {
    snapshot: vi.fn(() => structuredClone(stored)),
    replace,
  };
  const publish = vi.fn();
  const service = new CommandService(repository, {
    now: () => timestamp,
    createId: () => "generated-id",
    publish,
  });

  return { service, repository, replace, persist, publish };
}

describe("CommandService", () => {
  it("persists a valid command before publishing its acknowledged snapshot", async () => {
    const { service, replace, publish } = makeService();

    const result = await service.execute(edit("After"));

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        notes: [expect.objectContaining({ body: "After" })],
      }),
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.invocationCallOrder[0]).toBeLessThan(
      publish.mock.invocationCallOrder[0],
    );
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: [expect.objectContaining({ body: "After" })],
      }),
    );
  });

  it("keeps the current snapshot and publishes nothing when persistence fails", async () => {
    const initial = makeDocument();
    const { service, repository, replace, publish } = makeService(initial);
    replace.mockResolvedValueOnce({ ok: false, error: writeError });

    await expect(service.execute(edit("Not saved"))).resolves.toEqual({
      ok: false,
      error: writeError,
    });
    expect(repository.snapshot()).toEqual(initial);
    expect(publish).not.toHaveBeenCalled();
    await expect(service.undo()).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        message: "There is no document action to undo.",
      }),
    });
  });

  it("does not persist, publish, or add undo state for an invalid command", async () => {
    const { service, replace, publish } = makeService();

    await expect(
      service.execute({
        type: "note.edit",
        noteId: "missing",
        body: "Invalid",
      }),
    ).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: "validation_failed" }),
    });
    expect(replace).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    await expect(service.undo()).resolves.toEqual({
      ok: false,
      error: {
        code: "validation_failed",
        message: "There is no document action to undo.",
        retryable: false,
      },
    });
  });

  it.each<DocumentCommand>([
    { type: "note.edit", noteId: "note-1", body: "Edited" },
    {
      type: "note.move",
      noteIds: ["note-1"],
      destinationSectionId: "inbox",
      destinationOrder: 0,
    },
    { type: "note.complete", noteIds: ["note-1"] },
    { type: "note.delete", noteIds: ["note-1"] },
    {
      type: "section.reorder",
      sectionId: "inbox",
      destinationOrder: 0,
    },
  ])("stores a cloned pre-command snapshot for $type", async (command) => {
    const initial = makeDocument();
    const { service, publish } = makeService(initial);

    const result = await service.execute(command);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const returnedNote = result.value.notes[0];
    if (returnedNote !== undefined) {
      returnedNote.body = "Mutated returned value";
    }

    await expect(service.undo()).resolves.toEqual({ ok: true, value: initial });
    expect(publish).toHaveBeenLastCalledWith(initial);
  });

  it("keeps only the latest 20 successful undoable snapshots", async () => {
    const { service } = makeService();

    for (let index = 1; index <= 21; index += 1) {
      await expect(service.execute(edit(`Edit ${index}`))).resolves.toEqual({
        ok: true,
        value: expect.any(Object),
      });
    }

    for (let index = 20; index >= 1; index -= 1) {
      const result = await service.undo();
      expect(result.ok && result.value.notes[0].body).toBe(`Edit ${index}`);
    }
    await expect(service.undo()).resolves.toEqual({
      ok: false,
      error: {
        code: "validation_failed",
        message: "There is no document action to undo.",
        retryable: false,
      },
    });
  });

  it("retains an undo snapshot and publishes nothing when undo persistence fails", async () => {
    const initial = makeDocument();
    const { service, replace, publish } = makeService(initial);
    await service.execute(edit("After"));
    publish.mockClear();
    replace.mockResolvedValueOnce({ ok: false, error: writeError });

    await expect(service.undo()).resolves.toEqual({
      ok: false,
      error: writeError,
    });
    expect(publish).not.toHaveBeenCalled();

    await expect(service.undo()).resolves.toEqual({ ok: true, value: initial });
  });

  it("does not create undo entries for the other command families", async () => {
    const initial = makeDocument();
    const { service } = makeService(initial);

    await service.execute({ type: "note.add", sectionId: "inbox", body: "New" });
    await service.execute({ type: "section.add", title: "Later" });
    await service.execute({
      type: "section.rename",
      sectionId: "inbox",
      title: "Renamed",
    });
    await service.execute({ type: "section.activate", sectionId: "inbox" });
    await service.execute({ type: "draft.set", sectionId: "inbox", body: "Draft" });
    await service.execute({ type: "draft.clear" });

    await expect(service.undo()).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        message: "There is no document action to undo.",
      }),
    });
  });

  it("clears older undo snapshots after a structural non-undoable command", async () => {
    const { service } = makeService();

    await service.execute(edit("Edited"));
    await service.execute({
      type: "note.add",
      sectionId: "inbox",
      body: "Newer note",
    });

    await expect(service.undo()).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        message: "There is no document action to undo.",
      }),
    });
  });

  it("preserves newer draft and active-section state when undoing a snapshot", async () => {
    const initial = makeDocument();
    initial.sections.push({
      id: "later",
      title: "Later",
      order: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const { service } = makeService(initial);

    await service.execute(edit("Edited"));
    await service.execute({ type: "section.activate", sectionId: "later" });
    await service.execute({
      type: "draft.set",
      sectionId: "later",
      body: "Newer draft",
    });

    const undone = await service.undo();
    expect(undone).toEqual({ ok: true, value: expect.any(Object) });
    if (!undone.ok) return;
    expect(undone.value.notes[0].body).toBe("Before");
    expect(undone.value.activeSectionId).toBe("later");
    expect(undone.value.draft).toEqual({
      body: "Newer draft",
      sectionId: "later",
      updatedAt: timestamp,
    });
  });

  it("serializes execute and undo requests even when persistence is delayed", async () => {
    const { service, replace, persist } = makeService();
    let releaseFirst: (() => void) | undefined;
    const firstWriteGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    replace.mockImplementationOnce(async (next) => {
      await firstWriteGate;
      return persist(next);
    });

    const first = service.execute(edit("First"));
    const second = service.execute(edit("Second"));
    const undo = service.undo();
    await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(1));

    releaseFirst?.();
    await expect(first).resolves.toEqual({ ok: true, value: expect.any(Object) });
    await expect(second).resolves.toEqual({
      ok: true,
      value: expect.objectContaining({
        notes: [expect.objectContaining({ body: "Second" })],
      }),
    });
    await expect(undo).resolves.toEqual({
      ok: true,
      value: expect.objectContaining({
        notes: [expect.objectContaining({ body: "First" })],
      }),
    });
  });
});
