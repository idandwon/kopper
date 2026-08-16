import type { KeyboardEvent, MouseEvent } from "react";

import type { Note, Section } from "../../../../shared/domain/document";
import type { NoteProjectionView } from "../search/projectNotes";
import { MarkdownEditor } from "../editor/MarkdownEditor";
import { cn } from "../../lib/utils";
import { NoteContextMenu, type NoteMenuAction } from "./NoteContextMenu";

export interface NoteSelectIntent {
  id: string;
  additive: boolean;
  extend: boolean;
}

export interface NoteCardProps {
  note: Note;
  view: NoteProjectionView;
  focused: boolean;
  selected: boolean;
  tabbable?: boolean;
  actionNoteIds: string[];
  actionNotes: Note[];
  sections: Section[];
  disabled: boolean;
  editing?: boolean;
  onEditingChange?(editing: boolean): void;
  onSave?(body: string): Promise<boolean>;
  onSelect(intent: NoteSelectIntent): void;
  onContextSelect(id: string): void;
  onMoveFocus(sourceId: string, direction: -1 | 1, extend: boolean): void;
  onAction(action: NoteMenuAction): void;
}

function isApplicationShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest(
      "input, textarea, select, button, a, [contenteditable], [role=dialog]",
    ) !== null
  );
}

export function NoteCard({
  note,
  view,
  focused,
  selected,
  tabbable = focused,
  actionNoteIds,
  actionNotes,
  sections,
  disabled,
  editing = false,
  onEditingChange,
  onSave,
  onSelect,
  onContextSelect,
  onMoveFocus,
  onAction,
}: NoteCardProps) {
  const effectiveNoteIds = selected ? actionNoteIds : [note.id];
  const effectiveNotes = selected ? actionNotes : [note];
  const statusAction = view === "completed" ? "restore" : "complete";
  const statusLabel =
    view === "completed" ? `Restore ${note.body}` : `Mark ${note.body} as done`;

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (disabled) return;
    onSelect({
      id: note.id,
      additive: event.metaKey || event.ctrlKey,
      extend: event.shiftKey,
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (disabled || isApplicationShortcutTarget(event.target)) return;
    const key = event.key.toLocaleLowerCase();
    const command = event.metaKey || event.ctrlKey;
    let action: NoteMenuAction | undefined;

    if (event.key === "Enter" && !command) {
      event.preventDefault();
      onAction({ type: "edit", noteId: note.id });
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      onMoveFocus(
        note.id,
        event.key === "ArrowDown" ? 1 : -1,
        event.shiftKey,
      );
      return;
    }
    if (event.key === " ") {
      action = { type: statusAction, noteIds: effectiveNoteIds };
    } else if (event.key === "Delete" || event.key === "Backspace") {
      action = { type: "delete", noteIds: effectiveNoteIds };
    } else if (command && key === "c") {
      action = {
        type: "copy",
        noteIds: effectiveNoteIds,
        mode: event.shiftKey ? "markdown-list" : "plain",
      };
    } else if (
      command &&
      event.shiftKey &&
      key === "m" &&
      view === "active" &&
      effectiveNoteIds.length >= 2
    ) {
      action = { type: "merge", noteIds: effectiveNoteIds };
    }

    if (action !== undefined) {
      event.preventDefault();
      onAction(action);
    }
  };

  return (
    <NoteContextMenu
      selectedNotes={effectiveNotes}
      sections={sections}
      onAction={onAction}
    >
      <div
        className="relative"
        data-note-owner-id={note.id}
        onContextMenu={() => {
          if (!disabled) onContextSelect(note.id);
        }}
      >
        <article
          role="option"
          aria-label={`Note: ${note.body}`}
          aria-selected={selected}
          aria-disabled={disabled || undefined}
          data-note-id={note.id}
          data-focused={focused}
          data-selected={selected}
          tabIndex={tabbable ? 0 : -1}
          className={cn(
            "rounded-lg border border-border bg-card py-3 pr-3 pl-10 text-[13px] leading-relaxed text-card-foreground outline-none transition-colors motion-reduce:transition-none",
            "focus-visible:ring-2 focus-visible:ring-ring/50",
            focused && "ring-1 ring-ring/40",
            selected && "border-primary/60 bg-accent",
            disabled && "opacity-60",
          )}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
        >
          <span className="sr-only">
            {view === "completed" ? "Completed" : "Captured"}
          </span>
          <MarkdownEditor
            noteId={note.id}
            body={note.body}
            editing={editing}
            disabled={disabled}
            autoFocus
            onEditingChange={onEditingChange ?? (() => undefined)}
            onSave={onSave ?? (async () => false)}
          />
        </article>
        <button
          type="button"
          aria-label={statusLabel}
          disabled={disabled}
          className={cn(
            "absolute top-4 left-4 size-3.5 rounded-full border-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none",
            view === "completed"
              ? "border-[var(--completed)] bg-[var(--completed)]"
              : "border-[var(--capture)] hover:bg-[var(--capture)]",
          )}
          onClick={() =>
            onAction({ type: statusAction, noteIds: effectiveNoteIds })
          }
        />
      </div>
    </NoteContextMenu>
  );
}
