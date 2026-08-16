import { describe, expect, it } from "vitest";

import {
  initialSelectionState,
  selectionReducer,
  type SelectionState,
} from "./selectionReducer";

const displayedIds = ["one", "two", "three", "four"];

function reduce(
  state: SelectionState,
  action: Parameters<typeof selectionReducer>[1],
): SelectionState {
  return selectionReducer(state, action);
}

describe("selectionReducer", () => {
  it("selects only the clicked note and makes it the focus and anchor", () => {
    expect(
      reduce(initialSelectionState, {
        type: "click",
        id: "two",
        displayedIds,
        additive: false,
        extend: false,
      }),
    ).toEqual({ focusedId: "two", anchorId: "two", selectedIds: ["two"] });
  });

  it("toggles Cmd-clicked notes while preserving displayed order", () => {
    const first = reduce(initialSelectionState, {
      type: "click",
      id: "three",
      displayedIds,
      additive: false,
      extend: false,
    });
    const second = reduce(first, {
      type: "click",
      id: "one",
      displayedIds,
      additive: true,
      extend: false,
    });
    expect(second).toEqual({
      focusedId: "one",
      anchorId: "one",
      selectedIds: ["one", "three"],
    });

    expect(
      reduce(second, {
        type: "click",
        id: "three",
        displayedIds,
        additive: true,
        extend: false,
      }).selectedIds,
    ).toEqual(["one"]);
  });

  it("selects a contiguous Shift-click range from the anchor", () => {
    const anchored: SelectionState = {
      focusedId: "two",
      anchorId: "two",
      selectedIds: ["two"],
    };
    expect(
      reduce(anchored, {
        type: "click",
        id: "four",
        displayedIds,
        additive: false,
        extend: true,
      }),
    ).toEqual({
      focusedId: "four",
      anchorId: "two",
      selectedIds: ["two", "three", "four"],
    });
  });

  it("moves keyboard focus without changing selection", () => {
    const state: SelectionState = {
      focusedId: "two",
      anchorId: "two",
      selectedIds: ["one"],
    };
    expect(
      reduce(state, {
        type: "move-focus",
        direction: 1,
        extend: false,
        displayedIds,
      }),
    ).toEqual({
      focusedId: "three",
      anchorId: "three",
      selectedIds: ["one"],
    });
  });

  it("extends and contracts a range with Shift+Arrow", () => {
    const state: SelectionState = {
      focusedId: "two",
      anchorId: "two",
      selectedIds: ["two"],
    };
    const extended = reduce(state, {
      type: "move-focus",
      direction: 1,
      extend: true,
      displayedIds,
    });
    expect(extended).toEqual({
      focusedId: "three",
      anchorId: "two",
      selectedIds: ["two", "three"],
    });
    expect(
      reduce(extended, {
        type: "move-focus",
        direction: -1,
        extend: true,
        displayedIds,
      }).selectedIds,
    ).toEqual(["two"]);
  });

  it("clears selection, focus, and anchor entries hidden by filtering", () => {
    expect(
      reduce(
        {
          focusedId: "three",
          anchorId: "two",
          selectedIds: ["one", "two", "three"],
        },
        { type: "reconcile", displayedIds: ["one", "four"] },
      ),
    ).toEqual({ focusedId: null, anchorId: null, selectedIds: ["one"] });
  });

  it("selects an unselected note for its context menu but preserves a selected batch", () => {
    const state: SelectionState = {
      focusedId: "one",
      anchorId: "one",
      selectedIds: ["one", "two"],
    };
    expect(reduce(state, { type: "context", id: "two", displayedIds })).toEqual(
      state,
    );
    expect(
      reduce(state, { type: "context", id: "four", displayedIds }),
    ).toEqual({
      focusedId: "four",
      anchorId: "four",
      selectedIds: ["four"],
    });
  });
});
