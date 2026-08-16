import type { KopperDocument, Note } from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import type {
  ClipboardCopyResult,
  NoteClipboardMode,
} from "../../shared/ipc/contract";

export interface DocumentSnapshotSource {
  currentResult(): Result<KopperDocument, KopperError>;
}

export interface ClipboardWriter {
  writeText(text: string): void;
}

function validationError(message: string): ClipboardCopyResult {
  return {
    ok: false,
    error: {
      code: "validation_failed",
      message,
      retryable: false,
    },
  };
}

export function formatNotesForClipboard(
  notes: Note[],
  mode: NoteClipboardMode,
): string {
  if (mode === "plain") return notes.map(({ body }) => body).join("\n\n");
  return notes
    .map(({ body }) => {
      const [firstLine = "", ...continuationLines] = body.split("\n");
      return [
        `- ${firstLine}`,
        ...continuationLines.map((line) => `  ${line}`),
      ].join("\n");
    })
    .join("\n");
}

export function copyNotesToClipboard(
  repository: DocumentSnapshotSource,
  clipboard: ClipboardWriter,
  noteIds: string[],
  mode: NoteClipboardMode,
): ClipboardCopyResult {
  if (noteIds.length === 0) {
    return validationError("At least one note must be selected for copying.");
  }
  if (new Set(noteIds).size !== noteIds.length) {
    return validationError("Selected note identifiers must be unique.");
  }

  const current = repository.currentResult();
  if (!current.ok) return current;
  const notesById = new Map(current.value.notes.map((note) => [note.id, note]));
  const notes = noteIds.map((id) => notesById.get(id));
  if (notes.some((note) => note === undefined)) {
    return validationError("Every selected note must exist.");
  }

  try {
    clipboard.writeText(formatNotesForClipboard(notes as Note[], mode));
  } catch {
    return {
      ok: false,
      error: {
        code: "write_failed",
        message: "The selected notes could not be written to the clipboard.",
        retryable: true,
        recoveryAction: "retry",
      },
    };
  }

  return { ok: true, value: { copiedCount: notes.length } };
}
