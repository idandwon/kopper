import type { Note } from "../../../../shared/domain/document";
import type {
  NoteProjectionView,
  SectionProjection,
} from "../search/projectNotes";

export type LifecyclePresentationKind = "complete" | "restore";
export type NotePresentationPhase = "pending" | "exiting";

export interface NotePresentationEntry {
  note: Note;
  kind: LifecyclePresentationKind;
  phase: NotePresentationPhase;
}

export interface NotePresentationState {
  entries: readonly NotePresentationEntry[];
}

export type NotePresentationAction =
  | {
      type: "lifecycle.begin";
      kind: LifecyclePresentationKind;
      notes: Note[];
    }
  | {
      type: "lifecycle.acknowledge" | "lifecycle.fail" | "lifecycle.finish";
      noteIds: string[];
    };

export const initialNotePresentationState: NotePresentationState = {
  entries: [],
};

export function presentNoteProjections(
  projections: SectionProjection[],
  entries: readonly NotePresentationEntry[],
  view: NoteProjectionView,
): SectionProjection[] {
  const lifecycleKind = view === "active" ? "complete" : "restore";
  const authoritativeIds = new Set(
    projections.flatMap(({ notes }) => notes.map(({ id }) => id)),
  );
  const retainedEntries = entries.filter((entry) => {
    const missing = !authoritativeIds.has(entry.note.id);
    return entry.kind === lifecycleKind && entry.phase === "exiting" && missing;
  });
  if (retainedEntries.length === 0) return projections;

  return projections.map((projection) => {
    const retainedNotes = retainedEntries
      .filter(({ note }) => note.sectionId === projection.section.id)
      .map(({ note }) => note);
    if (retainedNotes.length === 0) return projection;
    const notes = [...projection.notes, ...retainedNotes].sort((left, right) =>
      view === "completed"
        ? (right.completedAt ?? "").localeCompare(left.completedAt ?? "")
        : left.order - right.order,
    );
    return { ...projection, notes };
  });
}

export function notePresentationReducer(
  state: NotePresentationState,
  action: NotePresentationAction,
): NotePresentationState {
  if (action.type === "lifecycle.begin") {
    const incomingIds = new Set(action.notes.map(({ id }) => id));
    const retainedEntries = state.entries.filter(
      ({ note }) => !incomingIds.has(note.id),
    );
    const pendingEntries: NotePresentationEntry[] = action.notes.map(
      (note) => ({
        note,
        kind: action.kind,
        phase: "pending",
      }),
    );
    return { entries: [...retainedEntries, ...pendingEntries] };
  }

  const affectedIds = new Set(action.noteIds);
  if (action.type === "lifecycle.acknowledge") {
    return {
      entries: state.entries.map((entry) =>
        affectedIds.has(entry.note.id)
          ? { ...entry, phase: "exiting" }
          : entry,
      ),
    };
  }

  return {
    entries: state.entries.filter(({ note }) => !affectedIds.has(note.id)),
  };
}
