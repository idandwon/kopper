import { describe, expect, it } from "vitest";

import { OXIDE_LEDGER_THEME } from "../theme/presets";
import {
  createEmptyDocument,
  parseDocument,
  type KopperDocument,
  type Note,
} from "./document";

const timestamp = "2026-08-16T12:00:00.000Z";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    sectionId: "section-1",
    body: "A note",
    order: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
    previousPlacement: null,
    ...overrides,
  };
}

function withKnownSection(document: KopperDocument): KopperDocument {
  return {
    ...document,
    sections: [
      {
        id: "section-1",
        title: "Inbox",
        order: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    activeSectionId: "section-1",
  };
}

describe("createEmptyDocument", () => {
  it("creates one Inbox section and no notes", () => {
    const document = createEmptyDocument(new Date(timestamp));

    expect(document.schemaVersion).toBe(1);
    expect(document.sections).toEqual([
      expect.objectContaining({ title: "Inbox", order: 0 }),
    ]);
    expect(document.notes).toEqual([]);
    expect(document.activeSectionId).toBe(document.sections[0].id);
  });

  it("uses the version 1 persisted defaults", () => {
    const document = createEmptyDocument(new Date(timestamp));

    expect(document).toEqual(
      expect.objectContaining({
        shortcuts: {
          capture: { kind: "double-modifier", modifier: "shift" },
          togglePanel: "CommandOrControl+Shift+Space",
        },
        window: { pinned: false, bounds: null },
        appearance: { mode: "system", activeThemeId: "builtin:oxide-ledger" },
        customThemes: [],
        draft: null,
      }),
    );
    expect(document.sections[0]).toEqual(
      expect.objectContaining({ createdAt: timestamp, updatedAt: timestamp }),
    );
  });
});

describe("parseDocument", () => {
  it("round-trips a valid document without returning input references", () => {
    const document = withKnownSection(createEmptyDocument(new Date(timestamp)));
    document.notes = [makeNote()];

    const result = parseDocument(document);

    expect(result).toEqual({ ok: true, value: document });
    if (result.ok) {
      expect(result.value).not.toBe(document);
      expect(result.value.sections).not.toBe(document.sections);
      expect(result.value.notes).not.toBe(document.notes);
    }
  });

  it("rejects a note that references a missing section", () => {
    const document = createEmptyDocument();
    const result = parseDocument({
      ...document,
      notes: [makeNote({ sectionId: "missing" })],
    });

    expect(result).toEqual(expect.objectContaining({ ok: false }));
  });

  it("returns unsupported_schema without mutating newer data", () => {
    const input = { schemaVersion: 99, nested: { untouched: true } };
    const before = structuredClone(input);

    const result = parseDocument(input);

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "unsupported_schema" }),
    });
    expect(input).toEqual(before);
  });

  it("rejects duplicate section, note, and custom theme identifiers", () => {
    const base = withKnownSection(createEmptyDocument(new Date(timestamp)));
    const section = base.sections[0];
    const theme = {
      ...OXIDE_LEDGER_THEME,
      id: "theme-1",
      name: "Theme",
    };

    expect(
      parseDocument({ ...base, sections: [section, { ...section, order: 1 }] }).ok,
    ).toBe(false);
    expect(
      parseDocument({
        ...base,
        notes: [makeNote(), makeNote({ order: 1 })],
      }).ok,
    ).toBe(false);
    expect(
      parseDocument({ ...base, customThemes: [theme, { ...theme }] }).ok,
    ).toBe(false);
  });

  it("requires complete, strict persisted theme definitions without external metadata", () => {
    const base = withKnownSection(createEmptyDocument(new Date(timestamp)));
    const theme = {
      ...OXIDE_LEDGER_THEME,
      id: "theme-1",
      name: "Custom theme",
    };
    expect(parseDocument({ ...base, customThemes: [theme] }).ok).toBe(true);

    const { capture: _capture, ...missingCapture } = theme.light;
    expect(
      parseDocument({
        ...base,
        customThemes: [{ ...theme, light: missingCapture }],
      }).ok,
    ).toBe(false);
    expect(
      parseDocument({
        ...base,
        customThemes: [{ ...theme, $schema: "not-persisted" }],
      }).ok,
    ).toBe(false);
    expect(
      parseDocument({
        ...base,
        customThemes: [
          { ...theme, light: { ...theme.light, constructor: "#000000" } },
        ],
      }).ok,
    ).toBe(false);
  });

  it("requires contiguous section and active-note ordering", () => {
    const base = withKnownSection(createEmptyDocument(new Date(timestamp)));
    const secondSection = {
      ...base.sections[0],
      id: "section-2",
      title: "Later",
      order: 2,
    };

    expect(parseDocument({ ...base, sections: [...base.sections, secondSection] }).ok).toBe(
      false,
    );
    expect(parseDocument({ ...base, notes: [makeNote({ order: 1 })] }).ok).toBe(false);
  });

  it("validates the active section and draft section references", () => {
    const base = withKnownSection(createEmptyDocument(new Date(timestamp)));

    expect(parseDocument({ ...base, activeSectionId: "missing" }).ok).toBe(false);
    expect(
      parseDocument({
        ...base,
        draft: { body: "draft", sectionId: "missing", updatedAt: timestamp },
      }).ok,
    ).toBe(false);
  });

  it("accepts completed notes for a deleted section and excludes them from ordering", () => {
    const base = withKnownSection(createEmptyDocument(new Date(timestamp)));
    const completed = makeNote({
      id: "completed-note",
      sectionId: "deleted-section",
      order: 9,
      completedAt: timestamp,
      previousPlacement: { sectionId: "deleted-section", order: 9 },
    });

    const result = parseDocument({
      ...base,
      notes: [makeNote({ order: 0 }), completed],
    });

    expect(result).toEqual(expect.objectContaining({ ok: true }));
  });

  it("requires completed notes to retain a previous placement", () => {
    const base = withKnownSection(createEmptyDocument(new Date(timestamp)));

    const result = parseDocument({
      ...base,
      notes: [makeNote({ completedAt: timestamp, previousPlacement: null })],
    });

    expect(result).toEqual(expect.objectContaining({ ok: false }));
  });

  it("requires active notes to have no previous placement", () => {
    const base = withKnownSection(createEmptyDocument(new Date(timestamp)));

    const result = parseDocument({
      ...base,
      notes: [
        makeNote({ previousPlacement: { sectionId: "section-1", order: 0 } }),
      ],
    });

    expect(result).toEqual(expect.objectContaining({ ok: false }));
  });

  it("rejects malformed version 1 fields as invalid_document", () => {
    const document = createEmptyDocument(new Date(timestamp));

    expect(parseDocument({ ...document, unexpected: true })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_document" }),
    });
    expect(
      parseDocument({
        ...document,
        window: { pinned: false, bounds: { x: 0, y: 0, width: 339, height: 480 } },
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid_document" }),
    });
  });
});
