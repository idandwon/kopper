import { useState, type KeyboardEvent, type MouseEvent } from "react";

import type { Note, Section } from "../../../../shared/domain/document";
import { Button } from "../../components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import type { NoteProjectionView } from "../search/projectNotes";
import { MarkdownEditor } from "../editor/MarkdownEditor";
import { cn } from "../../lib/utils";
import { NoteContextMenu, type NoteMenuAction } from "./NoteContextMenu";
import { useNotesSurfaceOverlay } from "./NotesSurfaceVisibility";
import type { NotePresentationEntry } from "./notePresentationReducer";
import { resolveNoteKeyboardIntent } from "./noteKeyboardIntent";

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
  captureHighlighted?: boolean;
  presentation?: NotePresentationEntry;
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

const ignoreEditingChange = () => undefined;
const rejectSave = async () => false;

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
  captureHighlighted = false,
  presentation,
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
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const tooltipOverlay = useNotesSurfaceOverlay(tooltipOpen, setTooltipOpen);
  const interactionDisabled = disabled || presentation !== undefined;
  const completing =
    presentation?.kind === "complete" && presentation.phase === "exiting";
  const restoring =
    presentation?.kind === "restore" && presentation.phase === "exiting";
  const completedMarker = (view === "completed" && !restoring) || completing;
  const effectiveNoteIds = selected ? actionNoteIds : [note.id];
  const effectiveNotes = selected ? actionNotes : [note];
  const statusAction = view === "completed" ? "restore" : "complete";
  const statusLabel =
    view === "completed" ? `Restore ${note.body}` : `Mark ${note.body} as done`;

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (interactionDisabled) return;
    onSelect({
      id: note.id,
      additive: event.metaKey || event.ctrlKey,
      extend: event.shiftKey,
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (interactionDisabled || isApplicationShortcutTarget(event.target)) return;
    const intent = resolveNoteKeyboardIntent(
      {
        key: event.key,
        commandPressed: event.metaKey || event.ctrlKey,
        shiftPressed: event.shiftKey,
      },
      { noteId: note.id, effectiveNoteIds, view },
    );
    if (intent === null) return;

    event.preventDefault();
    if (intent.type === "move-focus") {
      onMoveFocus(note.id, intent.direction, intent.extend);
      return;
    }
    onAction(intent.action);
  };

  return (
    <NoteContextMenu
      selectedNotes={effectiveNotes}
      sections={sections}
      onAction={onAction}
    >
      <div
        className={cn(
          "relative overflow-hidden",
          presentation?.phase === "exiting" &&
            "motion-safe:animate-[note-lifecycle-exit_220ms_ease-in_forwards]",
        )}
        data-note-owner-id={note.id}
        data-presentation-kind={presentation?.kind}
        data-presentation-phase={presentation?.phase}
        onContextMenu={() => {
          if (!interactionDisabled) onContextSelect(note.id);
        }}
      >
        <article
          role="option"
          aria-label={`Note: ${note.body}`}
          aria-selected={selected}
          aria-disabled={interactionDisabled || undefined}
          aria-busy={presentation?.phase === "pending" || undefined}
          data-note-id={note.id}
          data-focused={focused}
          data-selected={selected}
          data-capture-highlighted={captureHighlighted}
          data-preview-clamped={!editing}
          tabIndex={tabbable ? 0 : -1}
          className={cn(
            "kopper-note-card kopper-note-card-preview rounded-[calc(var(--radius)+0.25rem)] border border-border bg-card py-3 pr-3 pl-10 text-[13px] leading-relaxed text-card-foreground outline-none transition-colors motion-reduce:transition-none",
            "focus-visible:ring-2 focus-visible:ring-ring/50",
            focused && "ring-1 ring-ring/40",
            selected && "border-primary bg-card ring-2 ring-primary/35",
            selected && focused && "pr-20",
            captureHighlighted &&
              "border-[var(--capture)] ring-2 ring-[var(--capture)]/35 motion-safe:animate-[captured-note-settle_180ms_ease-out]",
            interactionDisabled && "opacity-60",
          )}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
        >
          <span className="sr-only">
            {view === "completed" ? "Completed" : "Captured"}
          </span>
          {selected && focused ? (
            <span className="pointer-events-none absolute top-2 right-2 rounded-full border border-primary/35 bg-card px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-primary uppercase">
              ⌘C Copy
            </span>
          ) : null}
          <MarkdownEditor
            noteId={note.id}
            body={note.body}
            editing={editing}
            disabled={interactionDisabled}
            autoFocus
            onEditingChange={onEditingChange ?? ignoreEditingChange}
            onSave={onSave ?? rejectSave}
          />
        </article>
        <TooltipProvider>
          <Tooltip {...tooltipOverlay}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={statusLabel}
                disabled={interactionDisabled}
                className={cn(
                  "absolute top-4 left-4 size-3.5 rounded-full border-2 p-0",
                  completedMarker
                    ? "border-[var(--completed)] bg-[var(--completed)] hover:bg-[var(--completed)] dark:hover:bg-[var(--completed)]"
                    : "border-[var(--capture)] hover:bg-[var(--capture)]",
                )}
                onClick={() =>
                  onAction({ type: statusAction, noteIds: effectiveNoteIds })
                }
              />
            </TooltipTrigger>
            <TooltipContent>{statusLabel}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </NoteContextMenu>
  );
}
