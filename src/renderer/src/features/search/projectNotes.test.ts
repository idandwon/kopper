import { describe, expect, it } from "vitest";

import type { KopperDocument } from "../../../../shared/domain/document";
import { projectNotes } from "./projectNotes";

const timestamp = "2026-08-16T12:00:00.000Z";

function makeDocument(): KopperDocument {
  return {
    schemaVersion: 1,
    sections: [
      {
        id: "later",
        title: "Later",
        order: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "inbox",
        title: "Inbox",
        order: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "empty",
        title: "Empty",
        order: 2,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    notes: [
      {
        id: "second",
        sectionId: "inbox",
        body: "Second **MARKDOWN**",
        order: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
        previousPlacement: null,
      },
      {
        id: "later-note",
        sectionId: "later",
        body: "Later note",
        order: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
        previousPlacement: null,
      },
      {
        id: "first",
        sectionId: "inbox",
        body: "First markdown",
        order: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
        previousPlacement: null,
      },
      {
        id: "done",
        sectionId: "inbox",
        body: "Done markdown",
        order: 2,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: timestamp,
        previousPlacement: { sectionId: "inbox", order: 2 },
      },
    ],
    activeSectionId: "inbox",
    shortcuts: {
      capture: { kind: "double-modifier", modifier: "shift" },
      togglePanel: "CommandOrControl+Shift+Space",
    },
    window: { pinned: false, bounds: null },
    appearance: { mode: "system", activeThemeId: "oxide-ledger" },
    customThemes: [],
    draft: null,
  };
}

describe("projectNotes", () => {
  it("projects active notes in persisted section and note order without mutating input", () => {
    const document = makeDocument();
    const originalSections = document.sections.map(({ id }) => id);
    const originalNotes = document.notes.map(({ id }) => id);

    const result = projectNotes(document, "", "active");

    expect(result.map(({ section }) => section.id)).toEqual([
      "inbox",
      "later",
      "empty",
    ]);
    expect(result[0].notes.map(({ id }) => id)).toEqual(["first", "second"]);
    expect(result[1].notes.map(({ id }) => id)).toEqual(["later-note"]);
    expect(result[2].notes).toEqual([]);
    expect(document.sections.map(({ id }) => id)).toEqual(originalSections);
    expect(document.notes.map(({ id }) => id)).toEqual(originalNotes);
  });

  it("performs case-insensitive substring search across Markdown source and hides empty sections", () => {
    const result = projectNotes(makeDocument(), "**markdown**", "active");

    expect(result).toHaveLength(1);
    expect(result[0].section.id).toBe("inbox");
    expect(result[0].notes.map(({ id }) => id)).toEqual(["second"]);
  });

  it("treats whitespace-only search as empty", () => {
    expect(projectNotes(makeDocument(), "  \n ", "active")).toHaveLength(3);
  });

  it("projects completed notes newest-first in saved placement with first-section fallback", () => {
    const document = makeDocument();
    document.notes.push(
      {
        ...document.notes[3],
        id: "newer-done",
        body: "Newer done",
        completedAt: "2026-08-16T13:00:00.000Z",
        previousPlacement: { sectionId: "inbox", order: 0 },
      },
      {
        ...document.notes[3],
        id: "orphan-done",
        body: "Orphan done",
        completedAt: "2026-08-16T11:00:00.000Z",
        previousPlacement: { sectionId: "deleted", order: 0 },
      },
    );
    const result = projectNotes(document, "", "completed");

    expect(result.map(({ section }) => section.id)).toEqual([
      "inbox",
      "later",
      "empty",
    ]);
    expect(result[0].notes.map(({ id }) => id)).toEqual([
      "newer-done",
      "done",
      "orphan-done",
    ]);
    expect(result[1].notes).toEqual([]);
  });
});
