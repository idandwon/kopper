import type { Dispatch } from "react";

import { cn } from "../../lib/utils";
import { NoteCard } from "../notes/NoteCard";
import { useNotePresentation } from "../notes/NotePresentation";
import type {
  SelectionAction,
  SelectionState,
} from "../notes/selectionReducer";
import type {
  NoteProjectionView,
  SectionProjection,
} from "../search/projectNotes";
import { SectionManager } from "./SectionManager";
import { useSectionNoteActions } from "./useSectionNoteActions";

export interface SectionGroupProps {
  projection: SectionProjection;
  view: NoteProjectionView;
  displayedIds: string[];
  selection: SelectionState;
  dispatchSelection: Dispatch<SelectionAction>;
  captureHighlightedNoteId?: string | null;
  onExpand?(noteId: string): void;
  onEdit?(noteId: string): void;
  onEditNewWindow?(noteId: string): void;
}

export function SectionGroup({
  projection,
  view,
  displayedIds,
  selection,
  dispatchSelection,
  captureHighlightedNoteId = null,
  onExpand,
  onEdit,
  onEditNewWindow,
}: SectionGroupProps) {
  const { entries: presentationEntries } = useNotePresentation();
  const {
    activateSection,
    changeEditing,
    disabled,
    document,
    editingNoteId,
    handleAction,
    saveNote,
  } = useSectionNoteActions({ onExpand, onEdit, onEditNewWindow });
  const { section, notes } = projection;
  const active = document.activeSectionId === section.id;
  const selectedIds = new Set(selection.selectedIds);
  const notesById = new Map(document.notes.map((note) => [note.id, note]));
  const selectedNotes = selection.selectedIds.flatMap((id) => {
    const note = notesById.get(id);
    return note === undefined ? [] : [note];
  });
  return (
    <section aria-labelledby={`section-${section.id}`}>
      <div className="mb-2 flex items-center gap-2 font-mono text-[10px] tracking-[0.13em] text-muted-foreground uppercase">
        <h2 id={`section-${section.id}`} className="m-0 text-inherit">
          <button
            type="button"
            className={cn(
              "rounded-sm text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none",
              active && "text-foreground",
            )}
            aria-current={active ? "true" : undefined}
            disabled={disabled}
            onClick={() => activateSection(section.id)}
          >
            {section.title}
          </button>
        </h2>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span aria-label={`${notes.length} notes`} className="tracking-normal">
          {String(notes.length).padStart(2, "0")}
        </span>
        <SectionManager section={section} />
      </div>
      <div
        className="space-y-2"
        role="listbox"
        aria-label={`${section.title} notes`}
        aria-multiselectable="true"
      >
        {notes.map((note) => {
          const selected = selectedIds.has(note.id);
          return (
            <NoteCard
              key={note.id}
              note={note}
              view={view}
              focused={selection.focusedId === note.id}
              selected={selected}
              captureHighlighted={captureHighlightedNoteId === note.id}
              presentation={presentationEntries.find(
                ({ note: presentedNote }) => presentedNote.id === note.id,
              )}
              tabbable={
                selection.focusedId === note.id ||
                (selection.focusedId === null && displayedIds[0] === note.id)
              }
              actionNoteIds={selected ? selection.selectedIds : [note.id]}
              actionNotes={selected ? selectedNotes : [note]}
              sections={document.sections}
              disabled={disabled}
              editing={editingNoteId === note.id}
              onEditingChange={(editing) => changeEditing(note.id, editing)}
              onSave={(body) => saveNote(note.id, body)}
              onSelect={(intent) =>
                dispatchSelection({
                  type: "click",
                  displayedIds,
                  ...intent,
                })
              }
              onContextSelect={(id) =>
                dispatchSelection({ type: "context", id, displayedIds })
              }
              onMoveFocus={(sourceId, direction, extend) =>
                dispatchSelection({
                  type: "move-focus",
                  sourceId,
                  direction,
                  extend,
                  displayedIds,
                })
              }
              onAction={handleAction}
            />
          );
        })}
      </div>
    </section>
  );
}
