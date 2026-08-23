import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

vi.mock("./ShortcutSettings", () => ({
  ShortcutSettings: () => <div>Shortcut controls</div>,
}));
vi.mock("./AppearanceSettings", async () => {
  const {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } = await import("../../components/ui/select");

  return {
    AppearanceSettings: () => (
      <div>
        Appearance controls
        <input aria-label="Appearance input" />
        <textarea aria-label="Appearance textarea" />
        <div contentEditable aria-label="Appearance editor" />
        <div role="menu" aria-label="Appearance menu">
          <button type="button">Menu action</button>
        </div>
        <div role="dialog" aria-label="Appearance dialog">
          <button type="button">Dialog action</button>
        </div>
        <Select defaultValue="system">
          <SelectTrigger aria-label="Appearance mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">System</SelectItem>
            <SelectItem value="light">Light</SelectItem>
          </SelectContent>
        </Select>
        <button type="button">Page action</button>
      </div>
    ),
  };
});
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
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SettingsPage", () => {
  it("uses a compact icon-only Back control with an accessible tooltip", async () => {
    const user = userEvent.setup();
    render(
      <SettingsPage
        activeTab="shortcuts"
        captureUnavailable={false}
        changeTab={vi.fn()}
        closeSettings={vi.fn()}
      />,
    );

    const back = screen.getByRole("button", { name: "Back to notes" });
    expect(back).toHaveClass("size-8");
    expect(back).not.toHaveTextContent("Back");
    await user.hover(back);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Back to notes",
    );
  });

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

  it("lets the real shared Select own the first Escape before closing Settings", async () => {
    const user = userEvent.setup();
    const closeSettings = vi.fn();
    render(
      <SettingsPage
        activeTab="appearance"
        captureUnavailable={false}
        changeTab={vi.fn()}
        closeSettings={closeSettings}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Appearance mode" }));
    expect(screen.getByRole("listbox")).toBeVisible();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(closeSettings).not.toHaveBeenCalled();

    screen.getByRole("button", { name: "Page action" }).focus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(closeSettings).toHaveBeenCalledOnce();
  });
});
