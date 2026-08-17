import { describe, expect, it } from "vitest";

import type { Note } from "../../../../shared/domain/document";
import {
  initialNotePresentationState,
  notePresentationReducer,
  presentNoteProjections,
} from "./notePresentationReducer";

const timestamp = "2026-08-16T12:00:00.000Z";

function note(id: string): Note {
  return {
    id,
    sectionId: "inbox",
    body: `Note ${id}`,
    order: Number(id),
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
    previousPlacement: null,
  };
}

describe("note presentation reducer", () => {
  it("tracks pending completion snapshots without mutating prior state", () => {
    const first = note("1");
    const previous = initialNotePresentationState;

    const next = notePresentationReducer(previous, {
      type: "lifecycle.begin",
      kind: "complete",
      notes: [first],
    });

    expect(previous.entries).toHaveLength(0);
    expect(next.entries).toEqual([
      { note: first, kind: "complete", phase: "pending" },
    ]);
  });

  it("moves only acknowledged notes into exiting presentation", () => {
    const pending = notePresentationReducer(initialNotePresentationState, {
      type: "lifecycle.begin",
      kind: "complete",
      notes: [note("1"), note("2")],
    });

    const acknowledged = notePresentationReducer(pending, {
      type: "lifecycle.acknowledge",
      noteIds: ["1"],
    });

    expect(acknowledged.entries).toEqual([
      { note: note("1"), kind: "complete", phase: "exiting" },
      { note: note("2"), kind: "complete", phase: "pending" },
    ]);
  });

  it("retains only acknowledged missing notes in their source projection", () => {
    const section = {
      id: "inbox",
      title: "Inbox",
      order: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const retainedNote = note("1");
    const projections = [{ section, notes: [note("2")] }];

    const presented = presentNoteProjections(
      projections,
      [
        { note: retainedNote, kind: "complete", phase: "exiting" },
        { note: note("2"), kind: "complete", phase: "pending" },
      ],
      "active",
    );

    expect(presented[0]?.notes.map(({ id }) => id)).toEqual(["1", "2"]);
    expect(projections[0]?.notes.map(({ id }) => id)).toEqual(["2"]);
  });

  it("removes failed or finished lifecycle entries exactly", () => {
    const pending = notePresentationReducer(initialNotePresentationState, {
      type: "lifecycle.begin",
      kind: "restore",
      notes: [note("1"), note("2")],
    });
    const failed = notePresentationReducer(pending, {
      type: "lifecycle.fail",
      noteIds: ["1"],
    });
    const finished = notePresentationReducer(failed, {
      type: "lifecycle.finish",
      noteIds: ["2"],
    });

    expect(failed.entries).toEqual([
      { note: note("2"), kind: "restore", phase: "pending" },
    ]);
    expect(finished).toEqual(initialNotePresentationState);
  });
});
