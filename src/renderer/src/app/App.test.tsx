import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KopperDocument } from "../../../shared/domain/document";
import { App } from "./App";
import { useKopperDocument, type KopperDocumentContextValue } from "./DocumentProvider";

vi.mock("./DocumentProvider", () => ({ useKopperDocument: vi.fn() }));

const timestamp = "2026-08-16T12:00:00.000Z";
const document: KopperDocument = {
  schemaVersion: 1,
  sections: [{ id: "inbox", title: "Inbox", order: 0, createdAt: timestamp, updatedAt: timestamp }],
  notes: [
    { id: "note-1", sectionId: "inbox", body: "Captured note", order: 0, createdAt: timestamp, updatedAt: timestamp, completedAt: null, previousPlacement: null },
    { id: "note-2", sectionId: "inbox", body: "Completed note", order: 1, createdAt: timestamp, updatedAt: timestamp, completedAt: timestamp, previousPlacement: { sectionId: "inbox", order: 1 } },
  ],
  activeSectionId: "inbox",
  shortcuts: { capture: { kind: "double-modifier", modifier: "shift" }, togglePanel: "CommandOrControl+Shift+Space" },
  window: { pinned: false, bounds: null },
  appearance: { mode: "system", activeThemeId: "oxide-ledger" },
  customThemes: [],
  draft: null,
};

const mockedUseKopperDocument = vi.mocked(useKopperDocument);
const execute = vi.fn<KopperDocumentContextValue["execute"]>();
const undo = vi.fn<KopperDocumentContextValue["undo"]>();
const retryLastAction = vi.fn<KopperDocumentContextValue["retryLastAction"]>();

function contextValue(overrides: Partial<KopperDocumentContextValue> = {}): KopperDocumentContextValue {
  return { document, ready: true, pendingAction: null, error: null, execute, undo, retryLastAction, clearError: vi.fn(), ...overrides };
}

beforeEach(() => {
  execute.mockReset().mockResolvedValue(true);
  undo.mockReset().mockResolvedValue(true);
  retryLastAction.mockReset().mockResolvedValue(true);
  mockedUseKopperDocument.mockReturnValue(contextValue());
});
afterEach(cleanup);

describe("Oxide Ledger App", () => {
  it("renders the interactive active panel and lifecycle rail", () => {
    render(<App />);

    expect(screen.getByRole("searchbox", { name: "Search notes" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Active notes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeVisible();
    expect(screen.getByText("Captured note")).toBeVisible();
    expect(screen.queryByText("Completed note")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Add a note or prompt" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Undo" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add section" })).toBeVisible();
    expect(screen.getByText("Lifecycle: captured to completed")).toBeInTheDocument();
  });

  it("moves from the initial tabbable card and extends selection from that card", () => {
    const activeDocument: KopperDocument = {
      ...document,
      notes: [
        document.notes[0],
        {
          ...document.notes[1],
          body: "Second active note",
          completedAt: null,
          previousPlacement: null,
        },
      ],
    };
    mockedUseKopperDocument.mockReturnValue(
      contextValue({ document: activeDocument }),
    );

    const firstRender = render(<App />);
    const firstCard = screen.getByRole("option", { name: "Note: Captured note" });
    const secondCard = screen.getByRole("option", {
      name: "Note: Second active note",
    });
    expect(firstCard).toHaveAttribute("tabindex", "0");

    firstCard.focus();
    fireEvent.keyDown(firstCard, { key: "ArrowDown" });
    expect(secondCard).toHaveFocus();

    firstRender.unmount();
    render(<App />);
    const initialCard = screen.getByRole("option", {
      name: "Note: Captured note",
    });
    const extendedCard = screen.getByRole("option", {
      name: "Note: Second active note",
    });
    initialCard.focus();
    fireEvent.keyDown(initialCard, { key: "ArrowDown", shiftKey: true });

    expect(extendedCard).toHaveFocus();
    expect(initialCard).toHaveAttribute("aria-selected", "true");
    expect(extendedCard).toHaveAttribute("aria-selected", "true");
  });

  it("switches to completed projections, hides the composer, and filters by search", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Completed notes" }));
    expect(screen.getByText("Completed note")).toBeVisible();
    expect(screen.queryByText("Captured note")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Add a note or prompt" })).not.toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "missing");
    expect(screen.queryByRole("heading", { name: "Inbox" })).not.toBeInTheDocument();
    expect(screen.getByText("No matching notes")).toBeVisible();
  });

  it("enters inline editing with Return and saves through note.edit", async () => {
    render(<App />);
    const card = screen.getByRole("option", { name: "Note: Captured note" });
    card.focus();
    fireEvent.keyDown(card, { key: "Enter" });
    const editor = screen.getByRole("textbox", { name: "Edit note" });
    fireEvent.change(editor, { target: { value: "Edited note" } });
    fireEvent.keyDown(editor, { key: "Enter", metaKey: true });

    await vi.waitFor(() =>
      expect(execute).toHaveBeenCalledWith({
        type: "note.edit",
        noteId: "note-1",
        body: "Edited note",
      }),
    );
  });

  it("supports Cmd+K outside editors and Undo", async () => {
    const user = userEvent.setup();
    render(<App />);
    screen.getByRole("button", { name: "Undo" }).focus();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("searchbox")).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledOnce();
  });

  it("renders a persistent structured error with Retry only when retryable", async () => {
    const user = userEvent.setup();
    mockedUseKopperDocument.mockReturnValue(contextValue({ error: { code: "write_failed", message: "The ledger could not be written.", retryable: true, recoveryAction: "retry" } }));
    const { rerender } = render(<App />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The ledger could not be written.");
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(retryLastAction).toHaveBeenCalledOnce();
    expect(screen.getByText("Captured note")).toBeVisible();

    mockedUseKopperDocument.mockReturnValue(contextValue({ error: { code: "validation_failed", message: "Invalid action.", retryable: false } }));
    rerender(<App />);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid action.");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("renders a labeled loading progress region", () => {
    mockedUseKopperDocument.mockReturnValue(contextValue({ pendingAction: "load" }));
    render(<App />);
    expect(screen.getByRole("progressbar", { name: "Loading notes" })).toBeVisible();
  });
});
