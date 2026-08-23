import { describe, expect, it, vi } from "vitest";

import type { KopperDocument, Note } from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import {
  copyNotesToClipboard,
  formatNotesForClipboard,
  type ClipboardWriter,
  type DocumentSnapshotSource,
} from "./noteClipboard";

const timestamp = "2026-08-16T12:00:00.000Z";

function note(id: string, body: string, completed = false): Note {
  return {
    id,
    sectionId: "inbox",
    body,
    order: Number(id),
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: completed ? timestamp : null,
    previousPlacement: completed
      ? { sectionId: "inbox", order: Number(id) }
      : null,
  };
}

function snapshot(notes: Note[]): KopperDocument {
  return {
    schemaVersion: 1,
    sections: [
      {
        id: "inbox",
        title: "Inbox",
        order: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    notes,
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

function source(document: KopperDocument): DocumentSnapshotSource {
  return {
    currentResult: (): Result<KopperDocument, KopperError> => ({
      ok: true,
      value: structuredClone(document),
    }),
  };
}

describe("note clipboard", () => {
  it("joins plain note bodies with two newlines without changing completed text", () => {
    expect(
      formatNotesForClipboard(
        [note("0", "First line"), note("1", "Completed body", true)],
        "plain",
      ),
    ).toBe("First line\n\nCompleted body");
  });

  it("formats every note as a numbered Markdown item with aligned continuation lines", () => {
    expect(
      formatNotesForClipboard(
        [note("0", "First\ncontinues"), note("1", "Second\nline two")],
        "markdown-list",
      ),
    ).toBe("1. First\n   continues\n2. Second\n   line two");
  });

  it("aligns continuation lines after a two-digit ordered marker", () => {
    const notes = Array.from({ length: 10 }, (_, index) =>
      note(String(index), index === 9 ? "Tenth\ncontinues" : `Item ${index + 1}`),
    );

    expect(formatNotesForClipboard(notes, "markdown-list").split("\n").slice(-2)).toEqual([
      "10. Tenth",
      "    continues",
    ]);
  });

  it("resolves IDs from the current snapshot in the exact supplied order", () => {
    const writeText = vi.fn<ClipboardWriter["writeText"]>();
    const notes = [note("0", "First"), note("1", "Second")];

    expect(
      copyNotesToClipboard(
        source(snapshot(notes)),
        { writeText },
        ["1", "0"],
        "plain",
      ),
    ).toEqual({ ok: true, value: { copiedCount: 2 } });
    expect(writeText).toHaveBeenCalledWith("Second\n\nFirst");
  });

  it("returns validation errors and never writes for empty or missing IDs", () => {
    const writeText = vi.fn<ClipboardWriter["writeText"]>();
    const repository = source(snapshot([note("0", "First")]));

    for (const ids of [[], ["missing"], ["0", "missing"]]) {
      const result = copyNotesToClipboard(
        repository,
        { writeText },
        ids,
        "plain",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("validation_failed");
    }
    expect(writeText).not.toHaveBeenCalled();
  });
});
