import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Note, Section } from "../../../../shared/domain/document";
import { NoteContextMenu, type NoteMenuAction } from "./NoteContextMenu";

const timestamp = "2026-08-16T12:00:00.000Z";
const sections: Section[] = [
  {
    id: "inbox",
    title: "Inbox",
    order: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: "later",
    title: "Later",
    order: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

function note(id: string, completed = false): Note {
  return {
    id,
    sectionId: "inbox",
    body: `Body ${id}`,
    order: Number(id),
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: completed ? timestamp : null,
    previousPlacement: completed
      ? { sectionId: "inbox", order: Number(id) }
      : null,
  };
}

function openMenu(
  selectedNotes: Note[],
  onAction = vi.fn<(action: NoteMenuAction) => void>(),
) {
  render(
    <NoteContextMenu
      selectedNotes={selectedNotes}
      sections={sections}
      onAction={onAction}
    >
      <div>Card trigger</div>
    </NoteContextMenu>,
  );
  fireEvent.contextMenu(screen.getByText("Card trigger"), {
    clientX: 20,
    clientY: 20,
  });
  return onAction;
}

afterEach(cleanup);

describe("NoteContextMenu", () => {
  it("shows all applicable single-active-note actions and dispatches copy", () => {
    const onAction = openMenu([note("0")]);

    for (const name of [
      "Copy",
      "Copy as list",
      "Mark as done",
      "Expand",
      "Edit",
      "Edit in new window",
      "Move to",
      "Delete",
    ]) {
      expect(screen.getByRole("menuitem", { name })).toBeVisible();
    }
    expect(
      screen.queryByRole("menuitem", { name: "Merge notes" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Copy" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "copy",
      noteIds: ["0"],
      mode: "plain",
    });
  });

  it("shows batch-only actions and hides single-note actions for active notes", () => {
    openMenu([note("0"), note("1")]);

    expect(screen.getByRole("menuitem", { name: "Merge notes" })).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "Mark as done" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("menuitem", { name: "Expand" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Edit" }),
    ).not.toBeInTheDocument();
  });

  it("shows Restore only for an all-completed selection and no lifecycle action for mixed notes", () => {
    const { rerender } = render(
      <NoteContextMenu
        selectedNotes={[note("0", true)]}
        sections={sections}
        onAction={vi.fn()}
      >
        <div>Card trigger</div>
      </NoteContextMenu>,
    );
    fireEvent.contextMenu(screen.getByText("Card trigger"));
    expect(screen.getByRole("menuitem", { name: "Restore" })).toBeVisible();
    expect(
      screen.queryByRole("menuitem", { name: "Mark as done" }),
    ).not.toBeInTheDocument();
    cleanup();

    openMenu([note("0"), note("1", true)]);
    expect(
      screen.queryByRole("menuitem", { name: "Restore" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Mark as done" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Move to" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Merge notes" }),
    ).not.toBeInTheDocument();
    void rerender;
  });
});
