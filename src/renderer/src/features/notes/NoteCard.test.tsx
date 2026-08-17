import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Note, Section } from "../../../../shared/domain/document";
import { NoteCard, type NoteCardProps } from "./NoteCard";

const timestamp = "2026-08-16T12:00:00.000Z";
const note: Note = {
  id: "one",
  sectionId: "inbox",
  body: "First body",
  order: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
  completedAt: null,
  previousPlacement: null,
};
const sections: Section[] = [
  {
    id: "inbox",
    title: "Inbox",
    order: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

function props(overrides: Partial<NoteCardProps> = {}): NoteCardProps {
  return {
    note,
    view: "active",
    focused: true,
    selected: true,
    actionNoteIds: ["one", "two"],
    actionNotes: [note, { ...note, id: "two", body: "Second body", order: 1 }],
    sections,
    disabled: false,
    onSelect: vi.fn(),
    onContextSelect: vi.fn(),
    onMoveFocus: vi.fn(),
    onAction: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

describe("NoteCard", () => {
  it("exposes semantic selected and focused states separately", () => {
    const { rerender } = render(<NoteCard {...props()} />);
    const card = screen.getByRole("option", { name: "Note: First body" });
    expect(card).toHaveAttribute("aria-selected", "true");
    expect(card).toHaveAttribute("data-focused", "true");
    expect(card).toHaveAttribute("data-selected", "true");
    const lifecycle = screen.getByRole("button", {
      name: "Mark First body as done",
    });
    expect(lifecycle).toBeVisible();
    expect(lifecycle).toHaveAttribute("data-slot", "button");
    expect(lifecycle).toHaveClass("rounded-full");
    expect(screen.getByText("⌘C Copy")).toBeVisible();

    rerender(<NoteCard {...props({ focused: true, selected: false })} />);
    expect(card).toHaveAttribute("aria-selected", "false");
    expect(card).toHaveAttribute("data-focused", "true");
    expect(card).toHaveAttribute("data-selected", "false");
    expect(screen.queryByText("⌘C Copy")).not.toBeInTheDocument();
  });

  it("keeps complete long Markdown available behind a clamped card preview", () => {
    const longBody = [
      "**First line**",
      "Second line",
      "Third line",
      "Fourth line",
      "Fifth line remains available",
    ].join("\n\n");
    render(<NoteCard {...props({ note: { ...note, body: longBody } })} />);

    const card = screen.getByRole("option");
    expect(card).toHaveAttribute("aria-label", `Note: ${longBody}`);
    expect(card).toHaveAttribute("data-preview-clamped", "true");
    expect(screen.getByText("Fifth line remains available")).toBeInTheDocument();
  });

  it("disables interaction during pending and acknowledged lifecycle presentation", () => {
    const view = render(
      <NoteCard
        {...props({
          presentation: { note, kind: "complete", phase: "pending" },
        })}
      />,
    );
    const card = screen.getByRole("option");
    const statusButton = screen.getByRole("button", {
      name: "Mark First body as done",
    });
    expect(card).toHaveAttribute("aria-busy", "true");
    expect(statusButton).toBeDisabled();

    view.rerender(
      <NoteCard
        {...props({
          presentation: { note, kind: "complete", phase: "exiting" },
        })}
      />,
    );
    expect(card.closest("[data-note-owner-id]")).toHaveAttribute(
      "data-presentation-phase",
      "exiting",
    );
    expect(statusButton).toBeDisabled();
  });

  it("reports click modifiers without conflating focus and selection", async () => {
    const onSelect = vi.fn<NoteCardProps["onSelect"]>();
    render(<NoteCard {...props({ onSelect })} />);
    const card = screen.getByRole("option");

    fireEvent.click(card, { metaKey: true });
    expect(onSelect).toHaveBeenCalledWith({
      id: "one",
      additive: true,
      extend: false,
    });
    fireEvent.click(card, { shiftKey: true });
    expect(onSelect).toHaveBeenLastCalledWith({
      id: "one",
      additive: false,
      extend: true,
    });
  });

  it("supports completion, deletion, copying, merging, and focus movement shortcuts", () => {
    const onAction = vi.fn<NoteCardProps["onAction"]>();
    const onMoveFocus = vi.fn<NoteCardProps["onMoveFocus"]>();
    render(<NoteCard {...props({ onAction, onMoveFocus })} />);
    const card = screen.getByRole("option");

    fireEvent.keyDown(card, { key: " " });
    fireEvent.keyDown(card, { key: "Delete" });
    fireEvent.keyDown(card, { key: "c", metaKey: true });
    fireEvent.keyDown(card, { key: "c", metaKey: true, shiftKey: true });
    fireEvent.keyDown(card, { key: "m", metaKey: true, shiftKey: true });
    fireEvent.keyDown(card, { key: "ArrowDown", shiftKey: true });

    expect(onAction.mock.calls.map(([action]) => action)).toEqual([
      { type: "complete", noteIds: ["one", "two"] },
      { type: "delete", noteIds: ["one", "two"] },
      { type: "copy", noteIds: ["one", "two"], mode: "plain" },
      {
        type: "copy",
        noteIds: ["one", "two"],
        mode: "markdown-list",
      },
      { type: "merge", noteIds: ["one", "two"] },
    ]);
    expect(onMoveFocus).toHaveBeenCalledWith("one", 1, true);
  });

  it("keeps the circular lifecycle action keyboard operable", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn<NoteCardProps["onAction"]>();
    render(<NoteCard {...props({ onAction })} />);
    const lifecycle = screen.getByRole("button", {
      name: "Mark First body as done",
    });

    lifecycle.focus();
    await user.keyboard("{Enter}");

    expect(onAction).toHaveBeenCalledWith({
      type: "complete",
      noteIds: ["one", "two"],
    });
  });

  it("uses only the focused note for actions when it is not selected", () => {
    const onAction = vi.fn<NoteCardProps["onAction"]>();
    render(<NoteCard {...props({ selected: false, onAction })} />);
    fireEvent.keyDown(screen.getByRole("option"), { key: "Delete" });
    expect(onAction).toHaveBeenCalledWith({
      type: "delete",
      noteIds: ["one"],
    });
  });

  it("selects an unselected card before opening its context menu", () => {
    const onContextSelect = vi.fn<NoteCardProps["onContextSelect"]>();
    render(<NoteCard {...props({ selected: false, onContextSelect })} />);
    fireEvent.contextMenu(screen.getByRole("option"));
    expect(onContextSelect).toHaveBeenCalledWith("one");
  });
});
