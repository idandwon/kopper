import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

vi.mock("./ShortcutSettings", () => ({
  ShortcutSettings: () => <div>Shortcut controls</div>,
}));
vi.mock("./AppearanceSettings", () => ({
  AppearanceSettings: () => (
    <div>
      Appearance controls
      <input aria-label="Appearance input" />
      <textarea aria-label="Appearance textarea" />
      <select aria-label="Appearance select" />
      <div contentEditable aria-label="Appearance editor" />
      <div role="menu" aria-label="Appearance menu">
        <button type="button">Menu action</button>
      </div>
      <div role="dialog" aria-label="Appearance dialog">
        <button type="button">Dialog action</button>
      </div>
      <button type="button">Page action</button>
    </div>
  ),
}));
vi.mock("./DataSettings", () => ({
  DataSettings: () => <div>Data controls</div>,
}));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SettingsPage", () => {
  it("renders the active tab in one settings scroll owner and changes tabs", async () => {
    const user = userEvent.setup();
    const changeTab = vi.fn();
    const { container, rerender } = render(
      <SettingsPage
        activeTab="appearance"
        captureUnavailable={false}
        changeTab={changeTab}
        closeSettings={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
    expect(screen.getByText("Appearance controls")).toBeVisible();
    expect(container.querySelectorAll('[data-scroll-owner="settings"]')).toHaveLength(1);

    await user.click(screen.getByRole("tab", { name: "Data" }));
    expect(changeTab).toHaveBeenCalledWith("data");

    rerender(
      <SettingsPage
        activeTab="data"
        captureUnavailable={false}
        changeTab={changeTab}
        closeSettings={vi.fn()}
      />,
    );
    expect(screen.getByText("Data controls")).toBeVisible();
    expect(screen.queryByText("Appearance controls")).not.toBeInTheDocument();
  });

  it("closes on route-level Escape unless an interactive owner keeps it", () => {
    const closeSettings = vi.fn();
    render(
      <SettingsPage
        activeTab="appearance"
        captureUnavailable={false}
        changeTab={vi.fn()}
        closeSettings={closeSettings}
      />,
    );

    const protectedOwners = [
      screen.getByRole("textbox", { name: "Appearance input" }),
      screen.getByRole("textbox", { name: "Appearance textarea" }),
      screen.getByRole("combobox", { name: "Appearance select" }),
      screen.getByLabelText("Appearance editor"),
      screen.getByRole("button", { name: "Menu action" }),
      screen.getByRole("button", { name: "Dialog action" }),
    ];
    for (const owner of protectedOwners) {
      owner.focus();
      fireEvent.keyDown(window, { key: "Escape" });
    }
    expect(closeSettings).not.toHaveBeenCalled();

    screen.getByRole("button", { name: "Page action" }).focus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(closeSettings).toHaveBeenCalledOnce();
  });
});
