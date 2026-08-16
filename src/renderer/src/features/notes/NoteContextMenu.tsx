import type { ReactNode } from "react";

import type { Note, Section } from "../../../../shared/domain/document";
import type { NoteClipboardMode } from "../../../../shared/ipc/contract";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "../../components/ui/context-menu";

export type NoteMenuAction =
  | { type: "copy"; noteIds: string[]; mode: NoteClipboardMode }
  | { type: "complete"; noteIds: string[] }
  | { type: "restore"; noteIds: string[] }
  | { type: "expand"; noteId: string }
  | { type: "edit"; noteId: string }
  | { type: "edit-new-window"; noteId: string }
  | { type: "merge"; noteIds: string[] }
  | { type: "move"; noteIds: string[]; destinationSectionId: string }
  | { type: "delete"; noteIds: string[] };

export interface NoteContextMenuProps {
  selectedNotes: Note[];
  sections: Section[];
  onAction(action: NoteMenuAction): void;
  children: ReactNode;
}

export function NoteContextMenu({
  selectedNotes,
  sections,
  onAction,
  children,
}: NoteContextMenuProps) {
  const noteIds = selectedNotes.map(({ id }) => id);
  const singleNote = selectedNotes.length === 1 ? selectedNotes[0] : undefined;
  const allActive =
    selectedNotes.length > 0 &&
    selectedNotes.every(({ completedAt }) => completedAt === null);
  const allCompleted =
    selectedNotes.length > 0 &&
    selectedNotes.every(({ completedAt }) => completedAt !== null);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent aria-label="Note actions">
        <ContextMenuItem
          onSelect={() => onAction({ type: "copy", noteIds, mode: "plain" })}
        >
          Copy
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() =>
            onAction({ type: "copy", noteIds, mode: "markdown-list" })
          }
        >
          Copy as list
        </ContextMenuItem>

        {(allActive || allCompleted) && <ContextMenuSeparator />}
        {allActive && (
          <ContextMenuItem
            onSelect={() => onAction({ type: "complete", noteIds })}
          >
            Mark as done
          </ContextMenuItem>
        )}
        {allCompleted && (
          <ContextMenuItem
            onSelect={() => onAction({ type: "restore", noteIds })}
          >
            Restore
          </ContextMenuItem>
        )}

        {singleNote !== undefined && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() =>
                onAction({ type: "expand", noteId: singleNote.id })
              }
            >
              Expand
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => onAction({ type: "edit", noteId: singleNote.id })}
            >
              Edit
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() =>
                onAction({ type: "edit-new-window", noteId: singleNote.id })
              }
            >
              Edit in new window
            </ContextMenuItem>
          </>
        )}

        {allActive && (
          <>
            {selectedNotes.length >= 2 && (
              <ContextMenuItem
                onSelect={() => onAction({ type: "merge", noteIds })}
              >
                Merge notes
              </ContextMenuItem>
            )}
            <ContextMenuSub>
              <ContextMenuSubTrigger>Move to</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {sections.map((section) => (
                  <ContextMenuItem
                    key={section.id}
                    onSelect={() =>
                      onAction({
                        type: "move",
                        noteIds,
                        destinationSectionId: section.id,
                      })
                    }
                  >
                    {section.title}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}

        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => onAction({ type: "delete", noteIds })}
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
