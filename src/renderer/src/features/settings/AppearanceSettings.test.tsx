import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KopperDocumentContextValue } from "../../app/DocumentProvider";
import { useKopperDocument } from "../../app/DocumentProvider";
import { useTheme } from "../../theme/ThemeProvider";
import { SHADCN_DEFAULT_THEME } from "../../../../shared/theme/presets";
import {
  AppearanceSettings,
  parseAppearanceMode,
} from "./AppearanceSettings";

vi.mock("../../app/DocumentProvider", () => ({ useKopperDocument: vi.fn() }));
vi.mock("../../theme/ThemeProvider", () => ({ useTheme: vi.fn() }));
vi.mock("./ThemeEditor", () => ({ ThemeEditor: () => null }));
vi.mock("./ThemeImportDialog", () => ({ ThemeImportDialog: () => <button>Import theme</button> }));

const execute = vi.fn<KopperDocumentContextValue["execute"]>();
const document = {
  schemaVersion: 1 as const,
  sections: [{ id: "inbox", title: "Inbox", order: 0, createdAt: "2026-08-16T12:00:00.000Z", updatedAt: "2026-08-16T12:00:00.000Z" }],
  notes: [],
  activeSectionId: "inbox",
  shortcuts: { capture: { kind: "double-modifier" as const, modifier: "shift" as const }, togglePanel: "CommandOrControl+Shift+Space" },
  window: { pinned: false, bounds: null },
  appearance: { mode: "system" as const, activeThemeId: "builtin:night-workshop" },
  customThemes: [],
  draft: null,
};

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  execute.mockReset().mockResolvedValue(true);
  vi.mocked(useKopperDocument).mockReturnValue({ document, ready: true, pendingAction: null, error: null, execute, undo: vi.fn(), retryLastAction: vi.fn(), clearError: vi.fn() });
  vi.mocked(useTheme).mockReturnValue({ resolvedMode: "dark", activeTheme: SHADCN_DEFAULT_THEME, previewTheme: vi.fn(), cancelPreview: vi.fn(), savePreview: vi.fn().mockResolvedValue({ status: "saved" }) });
  window.kopper = { exportTheme: vi.fn().mockResolvedValue({ ok: true, value: { path: "/theme.json" } }) } as never;
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("AppearanceSettings", () => {
  it("naturally narrows known modes and ignores unknown Select values", () => {
    expect(parseAppearanceMode("dark")).toBe("dark");
    expect(parseAppearanceMode("sepia")).toBeNull();
  });

  it("announces selected and resolved mode and sends an acknowledged mode command", async () => {
    const user = userEvent.setup();
    render(<AppearanceSettings />);
    expect(screen.getByRole("status")).toHaveTextContent("Selected system appearance; currently resolved to dark");
    const select = screen.getByRole("combobox", { name: "Appearance mode" });
    select.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(execute).toHaveBeenCalledWith({ type: "appearance.setMode", mode: "light" });
    expect(await screen.findByText("Appearance mode changed to light.")).toBeInTheDocument();

    execute.mockResolvedValueOnce(false);
    await user.click(select);
    await user.click(screen.getByRole("option", { name: "Dark" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Appearance mode could not be changed.",
    );
  });

  it("projects a legacy bundled active ID onto the Default row", async () => {
    render(<AppearanceSettings />);
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.queryByText("Oxide Ledger")).not.toBeInTheDocument();
    expect(screen.queryByText("Night Workshop")).not.toBeInTheDocument();
    expect(screen.queryByText("Index Drawer")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Active Default" }),
    ).toBeDisabled();
    const actions = screen.getByRole("button", {
      name: "Actions for Default",
    });
    expect(actions).toHaveTextContent(/^Actions$/);
    await userEvent.click(actions);
    expect(
      screen.getByRole("menuitem", { name: "Customize" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Export" }));
    expect(window.kopper.exportTheme).toHaveBeenCalledWith(SHADCN_DEFAULT_THEME.id);
  });

  it("keeps a failed custom-theme deletion authoritative, visible, and retryable", async () => {
    const user = userEvent.setup();
    const customTheme = {
      ...structuredClone(SHADCN_DEFAULT_THEME),
      id: "custom:deletion-failure",
      name: "Deletion Failure Theme",
    };
    vi.mocked(useKopperDocument).mockReturnValue({
      document: { ...document, customThemes: [customTheme] },
      ready: true,
      pendingAction: null,
      error: null,
      execute,
      undo: vi.fn(),
      retryLastAction: vi.fn(),
      clearError: vi.fn(),
    });
    execute.mockResolvedValueOnce(false);
    render(<AppearanceSettings />);

    await user.click(
      screen.getByRole("button", { name: "Actions for Deletion Failure Theme" }),
    );
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete theme" }));

    expect(execute).toHaveBeenCalledWith({
      type: "appearance.deleteCustomTheme",
      themeId: "custom:deletion-failure",
    });
    expect(screen.getByText("Deletion Failure Theme")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Custom theme could not be deleted.",
    );
    expect(
      screen.getByRole("button", { name: "Delete theme" }),
    ).toBeEnabled();
  });

  it("keeps a long theme name in a shrinking column with one bounded action menu", () => {
    const name = "A very long custom theme name that must wrap without widening settings";
    const customTheme = {
      ...structuredClone(SHADCN_DEFAULT_THEME),
      id: "custom:long-theme",
      name,
    };
    vi.mocked(useKopperDocument).mockReturnValue({
      document: { ...document, customThemes: [customTheme] },
      ready: true,
      pendingAction: null,
      error: null,
      execute,
      undo: vi.fn(),
      retryLastAction: vi.fn(),
      clearError: vi.fn(),
    });

    render(<AppearanceSettings />);

    expect(screen.getByText(name)).toHaveClass("break-words");
    expect(
      screen.getByRole("button", { name: `Actions for ${name}` }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: `Export ${name}` }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: `Delete ${name}` }),
    ).not.toBeInTheDocument();
  });
});
