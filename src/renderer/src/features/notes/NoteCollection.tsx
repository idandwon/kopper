import { useEffect, useMemo, useReducer, useRef, type Dispatch } from "react";

import type { KopperDocument } from "../../../../shared/domain/document";
import { ScrollArea } from "../../components/ui/scroll-area";
import { CompletedView } from "../completed/CompletedView";
import {
  initialSelectionState,
  selectionReducer,
  type SelectionAction,
  type SelectionState,
} from "./selectionReducer";
import { SectionGroup } from "../sections/SectionGroup";
import {
  projectNotes,
  type NoteProjectionView,
  type SectionProjection,
} from "../search/projectNotes";

interface ProjectedNotesProps {
  projections: SectionProjection[];
  displayedIds: string[];
  view: NoteProjectionView;
  selection: SelectionState;
  dispatchSelection: Dispatch<SelectionAction>;
  captureHighlightedNoteId: string | null;
}

function ProjectedNotes({
  projections,
  displayedIds,
  view,
  selection,
  dispatchSelection,
  captureHighlightedNoteId,
}: ProjectedNotesProps) {
  const openEditor = (noteId: string) => {
    void window.kopper.openEditorWindow(noteId);
  };

  if (view === "completed") {
    return (
      <CompletedView
        projections={projections}
        displayedIds={displayedIds}
        selection={selection}
        dispatchSelection={dispatchSelection}
        onOpenEditor={openEditor}
      />
    );
  }

  return projections.map((projection) => (
    <SectionGroup
      key={projection.section.id}
      projection={projection}
      view="active"
      displayedIds={displayedIds}
      selection={selection}
      dispatchSelection={dispatchSelection}
      captureHighlightedNoteId={captureHighlightedNoteId}
      onExpand={openEditor}
      onEditNewWindow={openEditor}
    />
  ));
}

interface NoteCollectionProps {
  document: KopperDocument;
  query: string;
  view: NoteProjectionView;
  captureHighlightedNoteId: string | null;
}

export function NoteCollection({
  document,
  query,
  view,
  captureHighlightedNoteId,
}: NoteCollectionProps) {
  const [selection, dispatchSelection] = useReducer(
    selectionReducer,
    initialSelectionState,
  );
  const projections = useMemo(
    () => projectNotes(document, query, view),
    [document, query, view],
  );
  const displayedIds = useMemo(
    () => projections.flatMap(({ notes }) => notes.map(({ id }) => id)),
    [projections],
  );
  const previousDisplayedIdsRef = useRef(displayedIds);
  const activeElement = globalThis.document.activeElement;
  const focusedNoteElement =
    activeElement instanceof HTMLElement
      ? activeElement.closest<HTMLElement>(
          "[data-note-id], [data-note-owner-id]",
        )
      : null;
  const focusWasInNoteCollection =
    activeElement instanceof HTMLElement &&
    activeElement.closest("[role=listbox]") !== null;
  const previousFocusedId =
    focusedNoteElement?.dataset.noteId ??
    focusedNoteElement?.dataset.noteOwnerId ??
    selection.focusedId;
  const previousFocusedIndex =
    previousFocusedId === null || previousFocusedId === undefined
      ? -1
      : previousDisplayedIdsRef.current.indexOf(previousFocusedId);
  const focusedNoteWasRemoved =
    previousFocusedId !== null &&
    previousFocusedId !== undefined &&
    previousFocusedIndex >= 0 &&
    !displayedIds.includes(previousFocusedId);
  const canRestoreCollectionFocus =
    focusWasInNoteCollection &&
    focusedNoteWasRemoved &&
    displayedIds.length > 0;
  const fallbackFocusedId = canRestoreCollectionFocus
    ? displayedIds[Math.min(previousFocusedIndex, displayedIds.length - 1)]
    : undefined;
  const visibleSelection = useMemo(
    () =>
      selectionReducer(selection, {
        type: "reconcile",
        displayedIds,
        fallbackFocusedId,
      }),
    [displayedIds, fallbackFocusedId, selection],
  );
  const selectedCount = visibleSelection.selectedIds.length;

  useEffect(() => {
    dispatchSelection({
      type: "reconcile",
      displayedIds,
      fallbackFocusedId,
    });
    previousDisplayedIdsRef.current = displayedIds;
  }, [displayedIds, fallbackFocusedId]);

  useEffect(() => {
    if (visibleSelection.focusedId === null) return;
    const focusedCard = Array.from(
      globalThis.document.querySelectorAll<HTMLElement>("[data-note-id]"),
    ).find(({ dataset }) => dataset.noteId === visibleSelection.focusedId);
    focusedCard?.focus();
  }, [visibleSelection.focusedId]);

  useEffect(() => {
    if (captureHighlightedNoteId === null) return;
    const capturedCard = Array.from(
      globalThis.document.querySelectorAll<HTMLElement>("[data-note-id]"),
    ).find(({ dataset }) => dataset.noteId === captureHighlightedNoteId);
    capturedCard?.scrollIntoView({ block: "nearest" });
  }, [captureHighlightedNoteId]);

  return (
    <ScrollArea className="min-h-0 flex-1" aria-label="Notes by section">
      <div className="space-y-5 px-4 pt-1 pb-36 pl-5">
        {selectedCount > 1 ? (
          <p
            role="status"
            aria-live="polite"
            className="sticky top-0 z-10 m-0 w-fit rounded-full border border-primary/25 bg-card px-2 py-1 font-mono text-[9px] tracking-wide text-primary uppercase shadow-sm"
          >
            {selectedCount} selected · ⌘C copy · Space done
          </p>
        ) : null}
        <ProjectedNotes
          projections={projections}
          displayedIds={displayedIds}
          view={view}
          selection={visibleSelection}
          dispatchSelection={dispatchSelection}
          captureHighlightedNoteId={captureHighlightedNoteId}
        />
        {projections.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No matching notes
          </p>
        ) : null}
      </div>
    </ScrollArea>
  );
}
