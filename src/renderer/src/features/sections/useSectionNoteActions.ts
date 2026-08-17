import { useState } from "react";

import { useKopperDocument } from "../../app/DocumentProvider";
import { usePanelFeedback } from "../feedback/PanelFeedback";
import type { NoteMenuAction } from "../notes/NoteContextMenu";

interface SectionNoteActionOptions {
  onExpand?(noteId: string): void;
  onEdit?(noteId: string): void;
  onEditNewWindow?(noteId: string): void;
}

export function useSectionNoteActions({
  onExpand,
  onEdit,
  onEditNewWindow,
}: SectionNoteActionOptions) {
  const { document, execute, pendingAction } = useKopperDocument();
  const { reportClipboardResult, reportClipboardUnavailable } =
    usePanelFeedback();
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const copyNotes = async (action: Extract<NoteMenuAction, { type: "copy" }>) => {
    try {
      const result = await window.kopper.copyNotes(action.noteIds, action.mode);
      reportClipboardResult(result);
    } catch {
      reportClipboardUnavailable();
    }
  };

  const handleAction = (action: NoteMenuAction) => {
    switch (action.type) {
      case "copy":
        void copyNotes(action);
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
        const selectedNoteIds = new Set(action.noteIds);
        const destinationOrder = document.notes.filter((note) => {
          const active = note.completedAt === null;
          const inDestination = note.sectionId === action.destinationSectionId;
          const moving = selectedNoteIds.has(note.id);
          return active && inDestination && !moving;
        }).length;
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
        setEditingNoteId(action.noteId);
        onEdit?.(action.noteId);
        return;
      case "edit-new-window":
        onEditNewWindow?.(action.noteId);
    }
  };

  const activateSection = (sectionId: string) => {
    void execute({ type: "section.activate", sectionId });
  };

  const changeEditing = (noteId: string, editing: boolean) => {
    setEditingNoteId(editing ? noteId : null);
  };

  const saveNote = (noteId: string, body: string) => {
    return execute({ type: "note.edit", noteId, body });
  };

  return {
    activateSection,
    changeEditing,
    disabled: pendingAction !== null,
    document,
    editingNoteId,
    handleAction,
    saveNote,
  };
}
