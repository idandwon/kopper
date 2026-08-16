import type { Dispatch } from "react";

import { cn } from "../../lib/utils";
import { useKopperDocument } from "../../app/DocumentProvider";
import { NoteCard } from "../notes/NoteCard";
import type { NoteMenuAction } from "../notes/NoteContextMenu";
import type {
  SelectionAction,
  SelectionState,
} from "../notes/selectionReducer";
import type {
  NoteProjectionView,
  SectionProjection,
} from "../search/projectNotes";
import { SectionManager } from "./SectionManager";

export interface SectionGroupProps {
  projection: SectionProjection;
  view: NoteProjectionView;
  displayedIds: string[];
  selection: SelectionState;
  dispatchSelection: Dispatch<SelectionAction>;
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
  onExpand,
  onEdit,
  onEditNewWindow,
}: SectionGroupProps) {
  const { document, execute, pendingAction } = useKopperDocument();
  const { section, notes } = projection;
  const active = document.activeSectionId === section.id;
  const selectedIds = new Set(selection.selectedIds);
  const notesById = new Map(document.notes.map((note) => [note.id, note]));
  const selectedNotes = selection.selectedIds.flatMap((id) => {
    const note = notesById.get(id);
    return note === undefined ? [] : [note];
  });
  const disabled = pendingAction !== null;

  const handleAction = (action: NoteMenuAction) => {
    switch (action.type) {
      case "copy":
        void window.kopper.copyNotes(action.noteIds, action.mode).catch(() => {
          // Document actions own persistent error UI; a later task adds clipboard notices.
        });
        return;
      case "complete":
        void execute({ type: "note.complete", noteIds: action.noteIds });
        return;
      case "restore":
        void execute({ type: "note.restore", noteIds: action.noteIds });
        return;
      case "merge":
        void execute({ type: "note.merge", noteIds: action.noteIds });
        return;
      case "delete":
        void execute({ type: "note.delete", noteIds: action.noteIds });
        return;
      case "move": {
        const selected = new Set(action.noteIds);
        const destinationOrder = document.notes.filter(
          (note) =>
            note.completedAt === null &&
            note.sectionId === action.destinationSectionId &&
            !selected.has(note.id),
        ).length;
        void execute({
          type: "note.move",
          noteIds: action.noteIds,
          destinationSectionId: action.destinationSectionId,
          destinationOrder,
        });
        return;
      }
      case "expand":
        onExpand?.(action.noteId);
        return;
      case "edit":
        onEdit?.(action.noteId);
        return;
      case "edit-new-window":
        onEditNewWindow?.(action.noteId);
        return;
    }
  };

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
            onClick={() =>
              void execute({ type: "section.activate", sectionId: section.id })
            }
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
              tabbable={
                selection.focusedId === note.id ||
                (selection.focusedId === null && displayedIds[0] === note.id)
              }
              actionNoteIds={selected ? selection.selectedIds : [note.id]}
              actionNotes={selected ? selectedNotes : [note]}
              sections={document.sections}
              disabled={disabled}
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
              onMoveFocus={(direction, extend) =>
                dispatchSelection({
                  type: "move-focus",
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
