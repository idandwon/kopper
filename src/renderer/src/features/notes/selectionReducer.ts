export interface SelectionState {
  focusedId: string | null;
  anchorId: string | null;
  selectedIds: string[];
}

export type SelectionAction =
  | {
      type: "click";
      id: string;
      displayedIds: string[];
      additive: boolean;
      extend: boolean;
    }
  | {
      type: "move-focus";
      direction: -1 | 1;
      extend: boolean;
      displayedIds: string[];
    }
  | { type: "context"; id: string; displayedIds: string[] }
  | { type: "reconcile"; displayedIds: string[] };

export const initialSelectionState: SelectionState = {
  focusedId: null,
  anchorId: null,
  selectedIds: [],
};

function orderedSelection(
  selectedIds: ReadonlySet<string>,
  displayedIds: string[],
): string[] {
  return displayedIds.filter((id) => selectedIds.has(id));
}

function range(
  displayedIds: string[],
  startId: string,
  endId: string,
): string[] {
  const start = displayedIds.indexOf(startId);
  const end = displayedIds.indexOf(endId);
  if (start < 0 || end < 0) return [];
  return displayedIds.slice(Math.min(start, end), Math.max(start, end) + 1);
}

export function selectionReducer(
  state: SelectionState,
  action: SelectionAction,
): SelectionState {
  switch (action.type) {
    case "click": {
      if (!action.displayedIds.includes(action.id)) return state;
      if (action.extend) {
        const anchorId =
          state.anchorId !== null &&
          action.displayedIds.includes(state.anchorId)
            ? state.anchorId
            : action.id;
        return {
          focusedId: action.id,
          anchorId,
          selectedIds: range(action.displayedIds, anchorId, action.id),
        };
      }
      if (action.additive) {
        const selected = new Set(state.selectedIds);
        if (selected.has(action.id)) selected.delete(action.id);
        else selected.add(action.id);
        return {
          focusedId: action.id,
          anchorId: action.id,
          selectedIds: orderedSelection(selected, action.displayedIds),
        };
      }
      return {
        focusedId: action.id,
        anchorId: action.id,
        selectedIds: [action.id],
      };
    }

    case "move-focus": {
      if (action.displayedIds.length === 0) return initialSelectionState;
      const currentIndex =
        state.focusedId === null
          ? -1
          : action.displayedIds.indexOf(state.focusedId);
      const fallbackIndex =
        action.direction === 1 ? 0 : action.displayedIds.length - 1;
      const nextIndex =
        currentIndex < 0
          ? fallbackIndex
          : Math.max(
              0,
              Math.min(
                action.displayedIds.length - 1,
                currentIndex + action.direction,
              ),
            );
      const focusedId = action.displayedIds[nextIndex];
      if (!action.extend) {
        return { ...state, focusedId, anchorId: focusedId };
      }
      const anchorId =
        state.anchorId !== null && action.displayedIds.includes(state.anchorId)
          ? state.anchorId
          : state.focusedId !== null &&
              action.displayedIds.includes(state.focusedId)
            ? state.focusedId
            : focusedId;
      return {
        focusedId,
        anchorId,
        selectedIds: range(action.displayedIds, anchorId, focusedId),
      };
    }

    case "context":
      if (!action.displayedIds.includes(action.id)) return state;
      return state.selectedIds.includes(action.id)
        ? state
        : {
            focusedId: action.id,
            anchorId: action.id,
            selectedIds: [action.id],
          };

    case "reconcile": {
      const visible = new Set(action.displayedIds);
      return {
        focusedId:
          state.focusedId !== null && visible.has(state.focusedId)
            ? state.focusedId
            : null,
        anchorId:
          state.anchorId !== null && visible.has(state.anchorId)
            ? state.anchorId
            : null,
        selectedIds: action.displayedIds.filter((id) =>
          state.selectedIds.includes(id),
        ),
      };
    }
  }
}
