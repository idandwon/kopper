import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KopperDocument } from "../../../../shared/domain/document";
import { useKopperDocument, type KopperDocumentContextValue } from "../../app/DocumentProvider";
import { PanelFeedbackProvider } from "../feedback/PanelFeedback";
import { NotePresentationProvider } from "../notes/NotePresentation";
import { initialSelectionState } from "../notes/selectionReducer";
import { projectNotes } from "../search/projectNotes";
import { CompletedView } from "./CompletedView";

vi.mock("../../app/DocumentProvider", () => ({ useKopperDocument: vi.fn() }));

const early = "2026-08-16T12:00:00.000Z";
const late = "2026-08-16T13:00:00.000Z";
const document: KopperDocument = {
  schemaVersion: 1,
  sections: [{ id: "inbox", title: "Inbox", order: 0, createdAt: early, updatedAt: early }],
  notes: [
    { id: "old", sectionId: "inbox", body: "Old completion", order: 0, createdAt: early, updatedAt: early, completedAt: early, previousPlacement: { sectionId: "inbox", order: 0 } },
    { id: "new", sectionId: "inbox", body: "New completion", order: 1, createdAt: early, updatedAt: late, completedAt: late, previousPlacement: { sectionId: "inbox", order: 1 } },
  ],
  activeSectionId: "inbox",
  shortcuts: { capture: { kind: "double-modifier", modifier: "shift" }, togglePanel: "CommandOrControl+Shift+Space" },
  window: { pinned: false, bounds: null },
  appearance: { mode: "system", activeThemeId: "oxide-ledger" },
  customThemes: [],
  draft: null,
};
const execute = vi.fn<KopperDocumentContextValue["execute"]>();

beforeEach(() => {
  execute.mockReset().mockResolvedValue(true);
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

describe("CompletedView", () => {
  it("renders newest completions first and restores through the shared card", async () => {
    const user = userEvent.setup();
    const projections = projectNotes(document, "", "completed");
    render(
      <PanelFeedbackProvider>
        <NotePresentationProvider>
          <CompletedView
            projections={projections}
            displayedIds={["new", "old"]}
            selection={initialSelectionState}
            dispatchSelection={vi.fn()}
            onOpenEditor={vi.fn()}
          />
        </NotePresentationProvider>
      </PanelFeedbackProvider>,
    );

    const cards = screen.getAllByRole("option");
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual([
      "Note: New completion",
      "Note: Old completion",
    ]);
    await user.click(screen.getByRole("button", { name: "Restore New completion" }));
    expect(execute).toHaveBeenCalledWith({ type: "note.restore", noteIds: ["new"] });
  });
});
