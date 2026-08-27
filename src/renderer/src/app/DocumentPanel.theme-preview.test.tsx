import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyDocument } from "../../../shared/domain/document";
import type { ThemeImportPreview } from "../../../shared/ipc/contract";
import { OXIDE_LEDGER_THEME } from "../../../shared/theme/presets";
import { ThemeProvider, useTheme } from "../theme/ThemeProvider";
import { DocumentPanel } from "./DocumentPanel";
import { useKopperDocument } from "./DocumentProvider";

vi.mock("./DocumentProvider", () => ({ useKopperDocument: vi.fn() }));

const kopperDocument = createEmptyDocument(
  new Date("2026-08-16T12:00:00.000Z"),
);
kopperDocument.appearance = {
  mode: "light",
  activeThemeId: OXIDE_LEDGER_THEME.id,
};
const importedTheme = {
  ...structuredClone(OXIDE_LEDGER_THEME),
  id: "custom:import-route-cleanup",
  name: "Import route cleanup",
  light: {
    ...OXIDE_LEDGER_THEME.light,
    primary: "#123456",
  },
};
const importedPreview: ThemeImportPreview = {
  theme: importedTheme,
  normalizedTokens: { light: [], dark: [] },
};

let openSettingsListener: (() => void) | undefined;
const execute = vi.fn().mockResolvedValue(true);

function ThemeProbe() {
  const { activeTheme } = useTheme();
  return <output aria-label="Applied theme primary">{activeTheme.light.primary}</output>;
}

function renderPanel() {
  return render(
    <ThemeProvider>
      <ThemeProbe />
      <DocumentPanel
        document={kopperDocument}
        captureUnavailable={false}
        permissionControls={{
          permission: "granted",
          operationError: null,
          pendingAction: null,
          checkAccess: vi.fn(),
          openSettings: vi.fn(),
        }}
      />
    </ThemeProvider>,
  );
}

async function openAppearanceSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Panel menu" }));
  await user.click(screen.getByRole("menuitem", { name: "Settings…" }));
  expect(screen.getByRole("tab", { name: "Appearance" })).toHaveAttribute(
    "data-state",
    "active",
  );
}

async function expectNativeRouteRestoredPersistedTheme() {
  act(() => openSettingsListener?.());

  expect(screen.getByRole("tab", { name: "Shortcuts" })).toHaveAttribute(
    "data-state",
    "active",
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByLabelText("Applied theme primary")).toHaveTextContent(
      OXIDE_LEDGER_THEME.light.primary,
    ),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Back to notes" })).toHaveFocus(),
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
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  execute.mockReset().mockResolvedValue(true);
  vi.mocked(useKopperDocument).mockReturnValue({
    document: kopperDocument,
    ready: true,
    pendingAction: null,
    error: null,
    execute,
    undo: vi.fn(),
    retryLastAction: vi.fn(),
    clearError: vi.fn(),
  });
  openSettingsListener = undefined;
  window.kopper = {
    getNativeAppearance: vi.fn().mockResolvedValue({ ok: true, value: false }),
    onNativeAppearanceChanged: vi.fn(() => vi.fn()),
    onOpenSettings: vi.fn((listener) => {
      openSettingsListener = listener;
      return vi.fn();
    }),
    onCaptureOutcome: vi.fn(() => vi.fn()),
    importTheme: vi.fn().mockResolvedValue({ ok: true, value: importedPreview }),
    exportTheme: vi.fn(),
    copyNotes: vi.fn(),
    openEditorWindow: vi.fn(),
    validateShortcuts: vi.fn(),
    saveShortcuts: vi.fn(),
    requestCapture: vi.fn(),
    setPinned: vi.fn(),
    getDataPath: vi.fn().mockResolvedValue({ ok: true, value: "/tmp/kopper.json" }),
  } as never;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  globalThis.document.documentElement.className = "";
  globalThis.document.documentElement.removeAttribute("style");
});

describe("DocumentPanel native Settings theme-preview ownership", () => {
  it("discards an owned dirty editor preview when the native route forces Shortcuts", async () => {
    const user = userEvent.setup();
    renderPanel();
    await openAppearanceSettings(user);

    await user.click(
      screen.getByRole("button", { name: `Actions for ${OXIDE_LEDGER_THEME.name}` }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Customize" }));
    fireEvent.change(screen.getByLabelText("primary"), {
      target: { value: "#123456" },
    });
    expect(screen.getByLabelText("Applied theme primary")).toHaveTextContent(
      "#123456",
    );

    await expectNativeRouteRestoredPersistedTheme();
  });

  it("discards only the import dialog's preview when native Settings forces Shortcuts", async () => {
    const user = userEvent.setup();
    renderPanel();
    await openAppearanceSettings(user);

    await user.click(screen.getByRole("button", { name: "Import theme" }));
    await user.click(await screen.findByRole("button", { name: "Preview" }));
    expect(screen.getByLabelText("Applied theme primary")).toHaveTextContent(
      "#123456",
    );

    await expectNativeRouteRestoredPersistedTheme();
  });
});
