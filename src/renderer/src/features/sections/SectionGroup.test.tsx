import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KopperDocument } from "../../../../shared/domain/document";
import {
  useKopperDocument,
  type KopperDocumentContextValue,
} from "../../app/DocumentProvider";
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

beforeEach(() => {
  execute.mockReset().mockResolvedValue(true);
  vi.mocked(useKopperDocument).mockReturnValue({
    document,
    pendingAction: null,
    error: null,
    execute,
    undo: vi.fn(),
    retryLastAction: vi.fn(),
    clearError: vi.fn(),
  });
});
afterEach(cleanup);

describe("SectionGroup", () => {
  it("renders a heading, count, and note bodies", () => {
    render(
      <SectionGroup
        projection={{ section: document.sections[0], notes: document.notes }}
        view="active"
      />,
    );

    expect(screen.getByRole("heading", { name: "Inbox" })).toBeVisible();
    expect(screen.getByLabelText("2 notes")).toHaveTextContent("02");
    expect(screen.getByText("First")).toBeVisible();
  });

  it("activates a section from its heading", async () => {
    const user = userEvent.setup();
    render(
      <SectionGroup
        projection={{ section: document.sections[0], notes: document.notes }}
        view="active"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Inbox" }));

    expect(execute).toHaveBeenCalledWith({
      type: "section.activate",
      sectionId: "inbox",
    });
  });
});
