import { describe, expect, it, vi } from "vitest";

import {
  applyDocumentCommand,
  DocumentCommandSchema,
  isUndoable,
  type CommandContext,
  type DocumentCommand,
} from "./commands";
import {
  createEmptyDocument,
  type KopperDocument,
  type Note,
  type ThemeDefinition,
} from "./document";
import { BUNDLED_THEMES, OXIDE_LEDGER_THEME } from "../theme/presets";

const initialTimestamp = "2026-08-15T12:00:00.000Z";
const commandTimestamp = "2026-08-16T12:00:00.000Z";

function makeDocument(): KopperDocument {
  const document = createEmptyDocument(new Date(initialTimestamp));
  document.sections = [
    {
      id: "inbox",
      title: "Inbox",
      order: 0,
      createdAt: initialTimestamp,
      updatedAt: initialTimestamp,
    },
    {
      id: "later",
      title: "Later",
      order: 1,
      createdAt: initialTimestamp,
      updatedAt: initialTimestamp,
    },
    {
      id: "archive",
      title: "Archive",
      order: 2,
      createdAt: initialTimestamp,
      updatedAt: initialTimestamp,
    },
  ];
  document.activeSectionId = "inbox";
  return document;
}

function makeNote(overrides: Partial<Note> & Pick<Note, "id">): Note {
  return {
    sectionId: "inbox",
    body: overrides.id,
    order: 0,
    createdAt: initialTimestamp,
    updatedAt: initialTimestamp,
    completedAt: null,
    previousPlacement: null,
    ...overrides,
  };
}

function makeContext(...ids: string[]): CommandContext & {
  createId: ReturnType<typeof vi.fn<() => string>>;
} {
  return {
    now: () => commandTimestamp,
    createId: vi.fn<() => string>().mockImplementation(() => {
      const id = ids.shift();
      if (id === undefined) throw new Error("No deterministic ID configured");
      return id;
    }),
  };
}

function apply(
  document: KopperDocument,
  command: DocumentCommand,
  context = makeContext(),
): KopperDocument {
  const before = structuredClone(document);
  const result = applyDocumentCommand(document, command, context);
  expect(result).toEqual({ ok: true, value: expect.any(Object) });
  expect(document).toEqual(before);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function expectValidationFailure(command: unknown): void {
  expect(applyDocumentCommand(makeDocument(), command, makeContext())).toEqual({
    ok: false,
    error: expect.objectContaining({ code: "validation_failed" }),
  });
}

describe("DocumentCommandSchema", () => {
  it.each([
    { type: "note.add", id: "not-a-uuid", sectionId: "inbox", body: "text" },
    { type: "note.add", sectionId: "inbox", body: "  \n" },
    { type: "note.edit", noteId: "note-1", body: "\t" },
    {
      type: "note.move",
      noteIds: [],
      destinationSectionId: "inbox",
      destinationOrder: 0,
    },
    { type: "note.complete", noteIds: ["note-1", "note-1"] },
    { type: "note.merge", noteIds: ["note-1"] },
    {
      type: "note.move",
      noteIds: ["note-1"],
      destinationSectionId: "inbox",
      destinationOrder: -1,
    },
    { type: "section.add", title: "   " },
    { type: "section.reorder", sectionId: "inbox", destinationOrder: -1 },
    { type: "appearance.setMode", mode: "sepia" },
    { type: "appearance.setActiveTheme", themeId: "" },
    { type: "appearance.deleteCustomTheme", themeId: "" },
  ])("rejects invalid command input %#", (command) => {
    expect(DocumentCommandSchema.safeParse(command).success).toBe(false);
    expectValidationFailure(command);
  });

  it("accepts a validated supplied note UUID", () => {
    expect(
      DocumentCommandSchema.safeParse({
        type: "note.add",
        id: "3f914c06-1cc5-4d2f-907a-9a00bda0e895",
        sectionId: "inbox",
        body: "Captured",
      }).success,
    ).toBe(true);
  });
});

describe("note commands", () => {
  it("adds notes in per-section active order using generated or supplied IDs", () => {
    const document = makeDocument();
    const context = makeContext("note-1", "unused");

    const first = apply(
      document,
      { type: "note.add", sectionId: "inbox", body: "First prompt" },
      context,
    );
    expect(first.notes).toEqual([
      {
        id: "note-1",
        sectionId: "inbox",
        body: "First prompt",
        order: 0,
        createdAt: commandTimestamp,
        updatedAt: commandTimestamp,
        completedAt: null,
        previousPlacement: null,
      },
    ]);

    const suppliedId = "3f914c06-1cc5-4d2f-907a-9a00bda0e895";
    const second = apply(
      first,
      {
        type: "note.add",
        id: suppliedId,
        sectionId: "inbox",
        body: " Second prompt ",
      },
      context,
    );
    expect(second.notes[1]).toEqual(
      expect.objectContaining({
        id: suppliedId,
        body: " Second prompt ",
        order: 1,
      }),
    );
    expect(context.createId).toHaveBeenCalledTimes(1);
  });

  it("edits a note while preserving creation and placement metadata", () => {
    const document = makeDocument();
    document.notes = [makeNote({ id: "first", body: "Before" })];

    const next = apply(document, {
      type: "note.edit",
      noteId: "first",
      body: " After ",
    });

    expect(next.notes[0]).toEqual({
      ...document.notes[0],
      body: " After ",
      updatedAt: commandTimestamp,
    });
    expect(next.notes[0].createdAt).toBe(initialTimestamp);
  });

  it("moves active notes after removal, preserving command order and compacting affected sections", () => {
    const document = makeDocument();
    document.notes = [
      makeNote({ id: "a", order: 0 }),
      makeNote({ id: "b", order: 1 }),
      makeNote({ id: "c", order: 2 }),
      makeNote({ id: "x", sectionId: "later", order: 0 }),
      makeNote({ id: "y", sectionId: "later", order: 1 }),
    ];

    const next = apply(document, {
      type: "note.move",
      noteIds: ["c", "a"],
      destinationSectionId: "later",
      destinationOrder: 1,
    });

    expect(next.notes.filter((note) => note.sectionId === "inbox")).toEqual([
      expect.objectContaining({ id: "b", order: 0 }),
    ]);
    expect(
      next.notes
        .filter((note) => note.sectionId === "later")
        .sort((left, right) => left.order - right.order),
    ).toEqual([
      expect.objectContaining({ id: "x", order: 0 }),
      expect.objectContaining({
        id: "c",
        order: 1,
        updatedAt: commandTimestamp,
      }),
      expect.objectContaining({
        id: "a",
        order: 2,
        updatedAt: commandTimestamp,
      }),
      expect.objectContaining({ id: "y", order: 3 }),
    ]);
  });

  it("completes active notes with their previous placements and restores them in saved order", () => {
    const document = makeDocument();
    document.notes = [
      makeNote({ id: "a", order: 0 }),
      makeNote({ id: "b", order: 1 }),
      makeNote({ id: "c", order: 2 }),
    ];

    const completed = apply(document, {
      type: "note.complete",
      noteIds: ["c", "a"],
    });
    expect(completed.notes).toEqual([
      expect.objectContaining({
        id: "a",
        order: 0,
        completedAt: commandTimestamp,
        previousPlacement: { sectionId: "inbox", order: 0 },
      }),
      expect.objectContaining({ id: "b", order: 0, completedAt: null }),
      expect.objectContaining({
        id: "c",
        order: 2,
        completedAt: commandTimestamp,
        previousPlacement: { sectionId: "inbox", order: 2 },
      }),
    ]);

    const restored = apply(completed, {
      type: "note.restore",
      noteIds: ["c", "a"],
    });
    expect(
      restored.notes
        .filter(
          (note) => note.completedAt === null && note.sectionId === "inbox",
        )
        .sort((left, right) => left.order - right.order),
    ).toEqual([
      expect.objectContaining({ id: "a", order: 0, previousPlacement: null }),
      expect.objectContaining({ id: "b", order: 1 }),
      expect.objectContaining({ id: "c", order: 2, previousPlacement: null }),
    ]);
  });

  it("restores to the first ordered section when the saved section no longer exists", () => {
    const document = makeDocument();
    document.notes = [
      makeNote({
        id: "done",
        sectionId: "deleted",
        order: 4,
        completedAt: initialTimestamp,
        previousPlacement: { sectionId: "deleted", order: 4 },
      }),
    ];

    const next = apply(document, { type: "note.restore", noteIds: ["done"] });

    expect(next.notes[0]).toEqual(
      expect.objectContaining({
        sectionId: "inbox",
        order: 0,
        completedAt: null,
        previousPlacement: null,
      }),
    );
  });

  it("deletes notes and compacts each affected active section", () => {
    const document = makeDocument();
    document.notes = [
      makeNote({ id: "a", order: 0 }),
      makeNote({ id: "b", order: 1 }),
      makeNote({ id: "c", order: 2 }),
      makeNote({ id: "x", sectionId: "later", order: 0 }),
      makeNote({ id: "y", sectionId: "later", order: 1 }),
    ];

    const next = apply(document, {
      type: "note.delete",
      noteIds: ["b", "x"],
    });

    expect(next.notes).toEqual([
      expect.objectContaining({ id: "a", order: 0 }),
      expect.objectContaining({ id: "c", order: 1 }),
      expect.objectContaining({ id: "y", order: 0 }),
    ]);
  });

  it("merges active notes in displayed command order into the first selected note across sections", () => {
    const document = makeDocument();
    document.notes = [
      makeNote({ id: "a", body: " A ", order: 0 }),
      makeNote({ id: "b", body: "B", order: 1 }),
      makeNote({ id: "x", body: " X ", sectionId: "later", order: 0 }),
      makeNote({ id: "y", body: "Y", sectionId: "later", order: 1 }),
    ];

    const next = apply(document, {
      type: "note.merge",
      noteIds: ["x", "a", "b"],
    });

    expect(next.notes).toEqual([
      expect.objectContaining({
        id: "x",
        sectionId: "later",
        body: "X\n\nA\n\nB",
        order: 0,
        updatedAt: commandTimestamp,
      }),
      expect.objectContaining({ id: "y", sectionId: "later", order: 1 }),
    ]);
  });

  it("rejects missing IDs and state-incompatible move, complete, restore, and merge commands", () => {
    const document = makeDocument();
    document.notes = [
      makeNote({ id: "active" }),
      makeNote({
        id: "done",
        completedAt: initialTimestamp,
        previousPlacement: { sectionId: "inbox", order: 1 },
      }),
    ];

    for (const command of [
      { type: "note.edit", noteId: "missing", body: "body" },
      {
        type: "note.move",
        noteIds: ["done"],
        destinationSectionId: "later",
        destinationOrder: 0,
      },
      { type: "note.complete", noteIds: ["done"] },
      { type: "note.restore", noteIds: ["active"] },
      { type: "note.delete", noteIds: ["missing"] },
      { type: "note.merge", noteIds: ["active", "done"] },
    ] satisfies DocumentCommand[]) {
      expect(applyDocumentCommand(document, command, makeContext())).toEqual({
        ok: false,
        error: expect.objectContaining({ code: "validation_failed" }),
      });
    }
  });
});

describe("section commands", () => {
  it("adds and trims a section at the end", () => {
    const next = apply(
      makeDocument(),
      { type: "section.add", title: "  Someday  " },
      makeContext("section-new"),
    );

    expect(next.sections.at(-1)).toEqual({
      id: "section-new",
      title: "Someday",
      order: 3,
      createdAt: commandTimestamp,
      updatedAt: commandTimestamp,
    });
  });

  it("renames, reorders, and activates sections", () => {
    const renamed = apply(makeDocument(), {
      type: "section.rename",
      sectionId: "later",
      title: "  Next  ",
    });
    expect(renamed.sections[1]).toEqual(
      expect.objectContaining({ title: "Next", updatedAt: commandTimestamp }),
    );

    const reordered = apply(renamed, {
      type: "section.reorder",
      sectionId: "archive",
      destinationOrder: 0,
    });
    expect(reordered.sections.map(({ id, order }) => ({ id, order }))).toEqual([
      { id: "archive", order: 0 },
      { id: "inbox", order: 1 },
      { id: "later", order: 2 },
    ]);

    const activated = apply(reordered, {
      type: "section.activate",
      sectionId: "later",
    });
    expect(activated.activeSectionId).toBe("later");
  });

  it("deletes an unreferenced section without requiring a destination", () => {
    const next = apply(makeDocument(), {
      type: "section.delete",
      sectionId: "archive",
    });

    expect(next.sections.map(({ id, order }) => ({ id, order }))).toEqual([
      { id: "inbox", order: 0 },
      { id: "later", order: 1 },
    ]);
  });

  it("rejects deleting the final section or a referenced section without a destination", () => {
    const document = makeDocument();
    document.notes = [
      makeNote({ id: "active" }),
      makeNote({
        id: "done",
        sectionId: "archive",
        completedAt: initialTimestamp,
        previousPlacement: { sectionId: "inbox", order: 4 },
      }),
    ];

    expect(
      applyDocumentCommand(
        document,
        { type: "section.delete", sectionId: "inbox" },
        makeContext(),
      ),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "validation_failed" }),
    });

    const single = makeDocument();
    single.sections = [single.sections[0]];
    expect(
      applyDocumentCommand(
        single,
        { type: "section.delete", sectionId: "inbox" },
        makeContext(),
      ),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "validation_failed" }),
    });
  });

  it("deletes into a destination, appends active notes, and rewrites completed restoration references", () => {
    const document = makeDocument();
    document.activeSectionId = "inbox";
    document.notes = [
      makeNote({ id: "a", order: 0 }),
      makeNote({ id: "b", order: 1 }),
      makeNote({ id: "x", sectionId: "later", order: 0 }),
      makeNote({
        id: "done",
        sectionId: "inbox",
        order: 3,
        completedAt: initialTimestamp,
        previousPlacement: { sectionId: "inbox", order: 3 },
      }),
    ];

    const next = apply(document, {
      type: "section.delete",
      sectionId: "inbox",
      destinationSectionId: "later",
    });

    expect(next.sections.map(({ id, order }) => ({ id, order }))).toEqual([
      { id: "later", order: 0 },
      { id: "archive", order: 1 },
    ]);
    expect(next.activeSectionId).toBe("later");
    expect(next.notes).toEqual([
      expect.objectContaining({ id: "a", sectionId: "later", order: 1 }),
      expect.objectContaining({ id: "b", sectionId: "later", order: 2 }),
      expect.objectContaining({ id: "x", sectionId: "later", order: 0 }),
      expect.objectContaining({
        id: "done",
        sectionId: "later",
        previousPlacement: { sectionId: "later", order: 3 },
      }),
    ]);
  });
});

describe("appearance commands", () => {
  const customTheme = (): ThemeDefinition => ({
    ...structuredClone(OXIDE_LEDGER_THEME),
    id: "custom:oxide",
    name: "Duplicate name allowed",
  });

  it("sets appearance mode and activates bundled or custom theme IDs", () => {
    const document = makeDocument();
    document.customThemes = [customTheme()];

    const dark = apply(document, { type: "appearance.setMode", mode: "dark" });
    expect(dark.appearance.mode).toBe("dark");
    expect(
      apply(dark, {
        type: "appearance.setActiveTheme",
        themeId: BUNDLED_THEMES[1].id,
      }).appearance.activeThemeId,
    ).toBe(BUNDLED_THEMES[1].id);
    expect(
      apply(dark, {
        type: "appearance.setActiveTheme",
        themeId: "custom:oxide",
      }).appearance.activeThemeId,
    ).toBe("custom:oxide");
  });

  it("upserts complete readable custom themes by authoritative ID and allows duplicate names", () => {
    const document = makeDocument();
    document.customThemes = [{ ...customTheme(), id: "custom:first" }];
    const inserted = apply(document, {
      type: "appearance.upsertCustomTheme",
      theme: { ...customTheme(), id: "custom:second" },
    });
    expect(inserted.customThemes).toHaveLength(2);
    expect(inserted.customThemes.map(({ name }) => name)).toEqual([
      "Duplicate name allowed",
      "Duplicate name allowed",
    ]);

    const replacement = {
      ...customTheme(),
      id: "custom:second",
      name: "Renamed",
    };
    expect(
      apply(inserted, {
        type: "appearance.upsertCustomTheme",
        theme: replacement,
      }).customThemes,
    ).toEqual([inserted.customThemes[0], replacement]);
  });

  it("rejects unknown activation/deletion and bundled overwrite/deletion", () => {
    const document = makeDocument();
    for (const command of [
      { type: "appearance.setActiveTheme", themeId: "missing" },
      { type: "appearance.deleteCustomTheme", themeId: "missing" },
      {
        type: "appearance.upsertCustomTheme",
        theme: structuredClone(OXIDE_LEDGER_THEME),
      },
      {
        type: "appearance.deleteCustomTheme",
        themeId: OXIDE_LEDGER_THEME.id,
      },
    ] satisfies DocumentCommand[]) {
      expect(applyDocumentCommand(document, command, makeContext())).toEqual({
        ok: false,
        error: expect.objectContaining({ code: "validation_failed" }),
      });
    }
  });

  it("validates strict complete readable persisted themes before upsert", () => {
    const incomplete = structuredClone(customTheme()) as unknown as Record<string, unknown>;
    delete (incomplete.light as Record<string, unknown>).capture;
    const unreadable = structuredClone(customTheme());
    unreadable.light.foreground = unreadable.light.background;

    for (const theme of [
      { ...customTheme(), extra: true },
      incomplete,
      unreadable,
    ]) {
      expectValidationFailure({
        type: "appearance.upsertCustomTheme",
        theme,
      });
    }
  });

  it("falls back to Oxide Ledger only when deleting the active custom theme", () => {
    const first = { ...customTheme(), id: "custom:first" };
    const second = { ...customTheme(), id: "custom:second" };
    const document = makeDocument();
    document.customThemes = [first, second];
    document.appearance.activeThemeId = first.id;

    const inactiveDeleted = apply(document, {
      type: "appearance.deleteCustomTheme",
      themeId: second.id,
    });
    expect(inactiveDeleted.appearance.activeThemeId).toBe(first.id);

    const activeDeleted = apply(inactiveDeleted, {
      type: "appearance.deleteCustomTheme",
      themeId: first.id,
    });
    expect(activeDeleted.appearance.activeThemeId).toBe(OXIDE_LEDGER_THEME.id);
  });
});

describe("final document validation", () => {
  it("returns parseDocument failures without mutating the input", () => {
    const document = makeDocument();
    const before = structuredClone(document);

    const result = applyDocumentCommand(
      document,
      { type: "note.add", sectionId: "inbox", body: "body" },
      { now: () => "not-a-timestamp", createId: () => "note" },
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_document" }),
    });
    expect(document).toEqual(before);
  });
});

describe("draft commands and undo classification", () => {
  it("sets and clears a draft with deterministic timestamps", () => {
    const set = apply(makeDocument(), {
      type: "draft.set",
      body: "unfinished",
      sectionId: "later",
    });
    expect(set.draft).toEqual({
      body: "unfinished",
      sectionId: "later",
      updatedAt: commandTimestamp,
    });

    expect(apply(set, { type: "draft.clear" }).draft).toBeNull();
  });

  it("marks only destructive/reversible command families undoable", () => {
    expect(
      [
        "note.edit",
        "note.move",
        "note.complete",
        "note.restore",
        "note.delete",
        "note.merge",
        "section.reorder",
        "section.delete",
      ].every((type) => isUndoable({ type } as DocumentCommand)),
    ).toBe(true);
    expect(
      [
        "note.add",
        "section.add",
        "section.rename",
        "section.activate",
        "draft.set",
        "draft.clear",
        "appearance.setMode",
        "appearance.setActiveTheme",
        "appearance.upsertCustomTheme",
        "appearance.deleteCustomTheme",
      ].some((type) => isUndoable({ type } as DocumentCommand)),
    ).toBe(false);
  });
});
