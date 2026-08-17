import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KopperDocument } from "../../../../shared/domain/document";
import { useKopperDocument, type KopperDocumentContextValue } from "../../app/DocumentProvider";
import { AddSectionDialog } from "./AddSectionDialog";
import { SectionManager } from "./SectionManager";

vi.mock("../../app/DocumentProvider", () => ({ useKopperDocument: vi.fn() }));

const timestamp = "2026-08-16T12:00:00.000Z";
const document: KopperDocument = {
  schemaVersion: 1,
  sections: [
    { id: "inbox", title: "Inbox", order: 0, createdAt: timestamp, updatedAt: timestamp },
    { id: "later", title: "Later", order: 1, createdAt: timestamp, updatedAt: timestamp },
  ],
  notes: [{ id: "one", sectionId: "inbox", body: "First", order: 0, createdAt: timestamp, updatedAt: timestamp, completedAt: null, previousPlacement: null }],
  activeSectionId: "inbox",
  shortcuts: { capture: { kind: "double-modifier", modifier: "shift" }, togglePanel: "CommandOrControl+Shift+Space" },
  window: { pinned: false, bounds: null },
  appearance: { mode: "system", activeThemeId: "oxide-ledger" },
  customThemes: [],
  draft: null,
};
const execute = vi.fn<KopperDocumentContextValue["execute"]>();

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  execute.mockReset().mockResolvedValue(true);
  vi.mocked(useKopperDocument).mockReturnValue({ document, ready: true, pendingAction: null, error: null, execute, undo: vi.fn(), retryLastAction: vi.fn(), clearError: vi.fn() });
});
afterEach(cleanup);

function ControlledAddSectionDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open add section
      </button>
      <AddSectionDialog
        mode="controlled"
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

describe("section management", () => {
  it("trims names when creating and renaming", async () => {
    const user = userEvent.setup();
    render(<AddSectionDialog />);
    await user.click(screen.getByRole("button", { name: "Add section" }));
    expect(screen.getByText("Section name", { selector: "label" })).toHaveAttribute(
      "data-slot",
      "label",
    );
    await user.type(screen.getByRole("textbox", { name: "Section name" }), "  Ideas  ");
    await user.click(screen.getByRole("button", { name: "Create section" }));
    expect(execute).toHaveBeenCalledWith({ type: "section.add", title: "Ideas" });

    cleanup();
    render(<SectionManager section={document.sections[0]} />);
    await user.click(screen.getByRole("button", { name: "Manage Inbox" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    const rename = screen.getByRole("textbox", { name: "Section name" });
    expect(screen.getByText("Section name", { selector: "label" })).toHaveAttribute(
      "data-slot",
      "label",
    );
    await user.clear(rename);
    await user.type(rename, "  Capture  ");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(execute).toHaveBeenCalledWith({ type: "section.rename", sectionId: "inbox", title: "Capture" });
  });

  it("supports a controlled dialog without rendering its own trigger", async () => {
    const user = userEvent.setup();
    render(<ControlledAddSectionDialog />);

    expect(
      screen.queryByRole("button", { name: "Add section" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open add section" }));
    expect(screen.getByRole("dialog", { name: "Add section" })).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: "Section name" }), "Ideas");
    await user.click(screen.getByRole("button", { name: "Create section" }));
    expect(execute).toHaveBeenCalledWith({ type: "section.add", title: "Ideas" });
  });

  it("uses explicit move up and down commands", async () => {
    const user = userEvent.setup();
    render(<SectionManager section={document.sections[1]} />);
    await user.click(screen.getByRole("button", { name: "Manage Later" }));
    await user.click(screen.getByRole("menuitem", { name: "Move up" }));
    expect(execute).toHaveBeenCalledWith({ type: "section.reorder", sectionId: "later", destinationOrder: 0 });
  });

  it("requires a destination before deleting a referenced section", async () => {
    const user = userEvent.setup();
    render(<SectionManager section={document.sections[0]} />);
    await user.click(screen.getByRole("button", { name: "Manage Inbox" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    const confirm = screen.getByRole("button", { name: "Delete section" });
    const destination = screen.getByRole("combobox", {
      name: "Move notes to",
    });
    expect(confirm).toBeDisabled();
    expect(destination.tagName).toBe("BUTTON");
    expect(screen.getByText("Move notes to", { selector: "label" })).toHaveAttribute(
      "data-slot",
      "label",
    );
    destination.focus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(execute).toHaveBeenCalledWith({ type: "section.delete", sectionId: "inbox", destinationSectionId: "later" });
  });
});
