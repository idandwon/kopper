import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyDocument } from "../../../../shared/domain/document";
import { useKopperDocument } from "../../app/DocumentProvider";
import { SettingsPage } from "./SettingsPage";
import type { SettingsTab } from "./settingsRoute";

vi.mock("../../app/DocumentProvider", () => ({ useKopperDocument: vi.fn() }));
vi.mock("./AppearanceSettings", () => ({
  AppearanceSettings: () => <div>Real tab switch target</div>,
}));
vi.mock("./DataSettings", () => ({
  DataSettings: () => <div>Data tab switch target</div>,
}));

const document = createEmptyDocument(new Date("2026-08-16T12:00:00.000Z"));

function ControlledSettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("shortcuts");
  return (
    <SettingsPage
      activeTab={activeTab}
      captureUnavailable={false}
      changeTab={setActiveTab}
      closeSettings={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.mocked(useKopperDocument).mockReturnValue({
    document,
    ready: true,
    pendingAction: null,
    error: null,
    execute: vi.fn(),
    undo: vi.fn(),
    retryLastAction: vi.fn(),
    clearError: vi.fn(),
  });
  window.kopper = {
    validateShortcuts: vi.fn(),
    saveShortcuts: vi.fn(),
    requestCapture: vi.fn(),
    setPinned: vi.fn(),
  } as never;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SettingsPage shortcut draft lifecycle", () => {
  it("retains the candidate across tabs while removing the inactive recorder", async () => {
    const user = userEvent.setup();
    render(<ControlledSettingsPage />);

    const toggle = screen.getByLabelText("Toggle panel");
    await user.clear(toggle);
    await user.type(toggle, "Command+Alt+U");
    await user.click(screen.getByRole("button", { name: "Record shortcut" }));
    expect(screen.getByRole("button", { name: "Recording…" })).toBeVisible();
    const shortcutHeading = screen.getByText("Shortcuts & panel");

    await user.click(screen.getByRole("tab", { name: "Appearance" }));
    expect(screen.getByText("Real tab switch target")).toBeVisible();
    expect(shortcutHeading).not.toBeVisible();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await user.click(screen.getByRole("tab", { name: "Shortcuts" }));

    expect(screen.getByLabelText("Toggle panel")).toHaveValue("Command+Alt+U");
    expect(screen.getByLabelText("Capture shortcut candidate")).toHaveTextContent(
      "Double Shift",
    );
    expect(
      screen.getByRole("button", { name: "Record shortcut" }),
    ).toBeVisible();
    expect(
      screen.queryByText("Press a shortcut, or Escape to cancel."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Real tab switch target")).not.toBeInTheDocument();
  });
});
