import "@testing-library/jest-dom/vitest";

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { KopperDocument } from "../../../shared/domain/document";
import { App } from "./App";
import { useDocument } from "./useDocument";

vi.mock("./useDocument", () => ({
  useDocument: vi.fn(),
}));

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
  ],
  notes: [
    {
      id: "note-1",
      sectionId: "inbox",
      body: "Captured note",
      order: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
      previousPlacement: null,
    },
  ],
  activeSectionId: "inbox",
  shortcuts: {
    capture: { kind: "double-modifier", modifier: "shift" },
    togglePanel: "CommandOrControl+Shift+Space",
  },
  window: { pinned: false, bounds: null },
  appearance: { mode: "system", activeThemeId: "oxide-ledger" },
  customThemes: [],
  draft: null,
};

const mockedUseDocument = vi.mocked(useDocument);

beforeEach(() => {
  mockedUseDocument.mockReturnValue({ status: "ready", document });
});

describe("Oxide Ledger App", () => {
  it("renders the read-only Oxide Ledger shell from the document", () => {
    render(<App />);

    expect(
      screen.getByRole("searchbox", { name: "Search notes" }),
    ).toBeVisible();
    expect(screen.getByText("⌘ K")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeVisible();
    expect(screen.getByText("Captured note")).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "Add a note or prompt" }),
    ).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "Add a note or prompt" }),
    ).toBeDisabled();
    expect(screen.getByText("Lifecycle: captured to completed")).toBeInTheDocument();
  });

  it("excludes completed notes from active sections and counts", () => {
    const withCompleted = structuredClone(document);
    withCompleted.notes.push({
      id: "note-2",
      sectionId: "inbox",
      body: "Completed note",
      order: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: timestamp,
      previousPlacement: { sectionId: "inbox", order: 1 },
    });
    mockedUseDocument.mockReturnValue({
      status: "ready",
      document: withCompleted,
    });

    const { container } = render(<App />);

    expect(within(container).queryByText("Completed note")).not.toBeInTheDocument();
    expect(within(container).getByLabelText("1 notes")).toHaveTextContent("01");
  });

  it("renders a labeled loading progress region", () => {
    mockedUseDocument.mockReturnValue({ status: "loading" });

    render(<App />);

    expect(
      screen.getByRole("progressbar", { name: "Loading notes" }),
    ).toBeVisible();
  });

  it("renders the exact structured repository error", () => {
    mockedUseDocument.mockReturnValue({
      status: "error",
      error: {
        code: "read_failed",
        message: "The ledger could not be read.",
        retryable: true,
        recoveryAction: "retry",
      },
    });

    render(<App />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The ledger could not be read.",
    );
  });
});
