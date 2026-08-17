import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KopperDocument } from "../../../../shared/domain/document";
import type { KopperApi } from "../../../../shared/ipc/contract";
import {
  useKopperDocument,
  type KopperDocumentContextValue,
} from "../../app/DocumentProvider";
import { PanelFeedbackProvider } from "../feedback/PanelFeedback";
import { SectionGroup } from "./SectionGroup";

vi.mock("../../app/DocumentProvider", () => ({ useKopperDocument: vi.fn() }));

const timestamp = "2026-08-16T12:00:00.000Z";
const document: KopperDocument = {
  schemaVersion: 1,
  sections: [
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
  ],
  notes: [
    {
      id: "one",
      sectionId: "inbox",
      body: "First",
      order: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
      previousPlacement: null,
    },
    {
      id: "two",
      sectionId: "inbox",
      body: "Second",
      order: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
      previousPlacement: null,
    },
  ],
  activeSectionId: "later",
  shortcuts: {
    capture: { kind: "double-modifier", modifier: "shift" },
    togglePanel: "CommandOrControl+Shift+Space",
  },
  window: { pinned: false, bounds: null },
  appearance: { mode: "system", activeThemeId: "oxide-ledger" },
  customThemes: [],
  draft: null,
};
const execute = vi.fn<KopperDocumentContextValue["execute"]>();
const copyNotes = vi.fn<KopperApi["copyNotes"]>();

beforeEach(() => {
  execute.mockReset().mockResolvedValue(true);
  copyNotes.mockReset().mockResolvedValue({
    ok: true,
    value: { copiedCount: 2 },
  });
  Object.defineProperty(window, "kopper", {
    configurable: true,
    value: { copyNotes },
  });
  vi.mocked(useKopperDocument).mockReturnValue({
    document,
    ready: true,
    pendingAction: null,
    error: null,
    execute,
    undo: vi.fn(),
    retryLastAction: vi.fn(),
    clearError: vi.fn(),
  });
});
afterEach(cleanup);

function renderWithPanelFeedback(children: ReactNode) {
  return render(
    <PanelFeedbackProvider>{children}</PanelFeedbackProvider>,
  );
}

describe("SectionGroup", () => {
  it("renders a heading, count, and note bodies", () => {
    renderWithPanelFeedback(
      <SectionGroup
        projection={{ section: document.sections[0], notes: document.notes }}
        view="active"
        displayedIds={["one", "two"]}
        selection={{ focusedId: null, anchorId: null, selectedIds: [] }}
        dispatchSelection={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Inbox" })).toBeVisible();
    expect(screen.getByLabelText("2 notes")).toHaveTextContent("02");
    expect(screen.getByText("First")).toBeVisible();
  });

  it("preserves displayed selection order when dispatching a batch shortcut", () => {
    renderWithPanelFeedback(
      <SectionGroup
        projection={{ section: document.sections[0], notes: document.notes }}
        view="active"
        displayedIds={["one", "two"]}
        selection={{
          focusedId: "one",
          anchorId: "one",
          selectedIds: ["one", "two"],
        }}
        dispatchSelection={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("option", { name: "Note: First" }), {
      key: "Delete",
    });
    expect(execute).toHaveBeenCalledWith({
      type: "note.delete",
      noteIds: ["one", "two"],
    });
  });

  it("reports clipboard success and unexpected bridge failure", async () => {
    renderWithPanelFeedback(
      <SectionGroup
        projection={{ section: document.sections[0], notes: document.notes }}
        view="active"
        displayedIds={["one", "two"]}
        selection={{
          focusedId: "one",
          anchorId: "one",
          selectedIds: ["one", "two"],
        }}
        dispatchSelection={vi.fn()}
      />,
    );
    const firstNote = screen.getByRole("option", { name: "Note: First" });

    fireEvent.keyDown(firstNote, { key: "c", metaKey: true });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Copied 2 notes.",
    );
    expect(copyNotes).toHaveBeenCalledWith(["one", "two"], "plain");

    copyNotes.mockRejectedValueOnce(new Error("private detail"));
    fireEvent.keyDown(firstNote, { key: "c", metaKey: true });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The selected notes could not be copied.",
    );
  });

  it("activates a section from its heading", async () => {
    const user = userEvent.setup();
    renderWithPanelFeedback(
      <SectionGroup
        projection={{ section: document.sections[0], notes: document.notes }}
        view="active"
        displayedIds={["one", "two"]}
        selection={{ focusedId: null, anchorId: null, selectedIds: [] }}
        dispatchSelection={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Inbox" }));

    expect(execute).toHaveBeenCalledWith({
      type: "section.activate",
      sectionId: "inbox",
    });
  });
});
