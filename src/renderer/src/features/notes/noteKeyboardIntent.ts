import type { NoteProjectionView } from "../search/projectNotes";
import type { NoteMenuAction } from "./NoteContextMenu";

export type NoteKeyboardIntent =
  | { type: "action"; action: NoteMenuAction }
  | { type: "move-focus"; direction: -1 | 1; extend: boolean };

interface NoteKeyboardInput {
  key: string;
  commandPressed: boolean;
  shiftPressed: boolean;
}

interface NoteKeyboardContext {
  noteId: string;
  effectiveNoteIds: string[];
  view: NoteProjectionView;
}

export function resolveNoteKeyboardIntent(
  input: NoteKeyboardInput,
  context: NoteKeyboardContext,
): NoteKeyboardIntent | null {
  const normalizedKey = input.key.toLocaleLowerCase();
  const statusAction = context.view === "completed" ? "restore" : "complete";

  if (input.key === "Enter" && !input.commandPressed) {
    return {
      type: "action",
      action: { type: "edit", noteId: context.noteId },
    };
  }
  if (input.key === "ArrowDown" || input.key === "ArrowUp") {
    return {
      type: "move-focus",
      direction: input.key === "ArrowDown" ? 1 : -1,
      extend: input.shiftPressed,
    };
  }
  if (input.key === " ") {
    return {
      type: "action",
      action: { type: statusAction, noteIds: context.effectiveNoteIds },
    };
  }
  if (input.key === "Delete" || input.key === "Backspace") {
    return {
      type: "action",
      action: { type: "delete", noteIds: context.effectiveNoteIds },
    };
  }
  if (input.commandPressed && normalizedKey === "c") {
    return {
      type: "action",
      action: {
        type: "copy",
        noteIds: context.effectiveNoteIds,
        mode: input.shiftPressed ? "markdown-list" : "plain",
      },
    };
  }

  const mergeRequested =
    input.commandPressed &&
    input.shiftPressed &&
    normalizedKey === "m" &&
    context.view === "active" &&
    context.effectiveNoteIds.length >= 2;
  if (!mergeRequested) return null;

  return {
    type: "action",
    action: { type: "merge", noteIds: context.effectiveNoteIds },
  };
}
