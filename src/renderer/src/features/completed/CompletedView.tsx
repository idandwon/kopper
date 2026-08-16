import type { Dispatch } from "react";

import { SectionGroup } from "../sections/SectionGroup";
import type { SectionProjection } from "../search/projectNotes";
import type { SelectionAction, SelectionState } from "../notes/selectionReducer";

export interface CompletedViewProps {
  projections: SectionProjection[];
  displayedIds: string[];
  selection: SelectionState;
  dispatchSelection: Dispatch<SelectionAction>;
  onOpenEditor(noteId: string): void;
}

export function CompletedView({
  projections,
  displayedIds,
  selection,
  dispatchSelection,
  onOpenEditor,
}: CompletedViewProps) {
  return (
    <>
      {projections.map((projection) => (
        <SectionGroup
          key={projection.section.id}
          projection={projection}
          view="completed"
          displayedIds={displayedIds}
          selection={selection}
          dispatchSelection={dispatchSelection}
          onExpand={onOpenEditor}
          onEditNewWindow={onOpenEditor}
        />
      ))}
    </>
  );
}
