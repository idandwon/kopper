import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KopperDocument } from "../../../shared/domain/document";
import { App } from "./App";
import {
  useKopperDocument,
  type KopperDocumentContextValue,
} from "./DocumentProvider";

let captureOutcomeListener:
  | ((outcome: import("../../../shared/ipc/contract").CaptureOutcome) => void)
  | undefined;
let openSettingsListener: (() => void) | undefined;

const onboardingMock = vi.hoisted(() => ({
  mode: "grant" as "grant" | "hold",
  mounts: 0,
  pendingAction: null as "repair" | "open-settings" | null,
  operationError: null as string | null,
}));

vi.mock("./DocumentProvider", () => ({ useKopperDocument: vi.fn() }));
vi.mock("../features/onboarding/AccessibilityPermissionGate", async () => {
  const { useState } = await import("react");
  return {
    AccessibilityPermissionGate: ({
      renderPanel,
    }: {
      renderPanel(
        captureUnavailable: boolean,
        controls: import("../features/onboarding/AccessibilityPermissionGate").AccessibilityPermissionPanelControls,
      ): React.ReactNode;
    }) => {
      onboardingMock.mounts += 1;
      const [continued, setContinued] = useState(false);
      const controls = {
        permission: continued ? ("denied" as const) : ("granted" as const),
        operationError: onboardingMock.operationError,
        pendingAction: onboardingMock.pendingAction,
        repairAccess: async () => undefined,
        openSettings: async () => undefined,
      };
      if (onboardingMock.mode === "grant") return renderPanel(false, controls);
      if (continued) return renderPanel(true, controls);
      return (
        <div>
          <h1>Accessibility onboarding</h1>
          <button type="button" onClick={() => setContinued(false)}>
            Grant mock access
          </button>
          <button type="button" onClick={() => setContinued(true)}>
            Continue mock without capture
          </button>
        </div>
      );
    },
  };
});
vi.mock("../features/recovery/RecoveryScreen", () => ({
  RecoveryScreen: () => <h1>Kopper needs recovery</h1>,
}));
vi.mock("../features/settings/AppearanceSettings", () => ({
  AppearanceSettings: () => <div>Appearance controls</div>,
}));
vi.mock("../features/settings/DataSettings", () => ({
  DataSettings: () => <div>Data controls</div>,
}));
vi.mock("../features/settings/ShortcutSettings", () => ({
  ShortcutSettings: () => <div>Shortcut controls</div>,
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
      id: "note-1",
      sectionId: "inbox",
      body: "Captured note",
      order: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
      previousPlacement: null,
    },
    {
      id: "note-2",
      sectionId: "inbox",
      body: "Completed note",
      order: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: timestamp,
      previousPlacement: { sectionId: "inbox", order: 1 },
    },
  ],
  activeSectionId: "inbox",
  shortcuts: {
    capture: { kind: "double-modifier", modifier: "shift" },
    togglePanel: "CommandOrControl+Shift+Space",
  },
  window: { pinned: false, bounds: null },
  appearance: { mode: "system", activeThemeId: "builtin:shadcn-default" },
  customThemes: [],
  draft: null,
};

const mockedUseKopperDocument = vi.mocked(useKopperDocument);
const execute = vi.fn<KopperDocumentContextValue["execute"]>();
const undo = vi.fn<KopperDocumentContextValue["undo"]>();
const retryLastAction = vi.fn<KopperDocumentContextValue["retryLastAction"]>();
const clearError = vi.fn<KopperDocumentContextValue["clearError"]>();
const setPinned = vi.fn();
const scrollIntoView = vi.fn();

function visiblePrimaryScrollOwners(): HTMLElement[] {
  return Array.from(
    globalThis.document.querySelectorAll<HTMLElement>(
      '[data-scroll-owner="notes"], [data-scroll-owner="settings"], [data-scroll-owner="editor"], [data-scroll-owner="onboarding"], [data-scroll-owner="recovery"]',
    ),
  ).filter((owner) => owner.closest("[hidden]") === null);
}

function contextValue(
  overrides: Partial<KopperDocumentContextValue> = {},
): KopperDocumentContextValue {
  return {
    document,
    ready: true,
    pendingAction: null,
    error: null,
    execute,
    undo,
    retryLastAction,
    clearError,
    ...overrides,
  };
}

async function expectNativeSettingsOwnsSurface(
  user: ReturnType<typeof userEvent.setup>,
  portal: HTMLElement,
): Promise<void> {
  act(() => openSettingsListener?.());

  expect(portal).not.toBeInTheDocument();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Hide Kopper" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Shortcuts" })).toHaveAttribute(
    "data-state",
    "active",
  );
  expect(screen.getByText("Shortcut controls")).toBeVisible();
  expect(screen.queryByText("Appearance controls")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("searchbox", { name: "Search notes" }),
  ).not.toBeInTheDocument();
  expect(visiblePrimaryScrollOwners()).toHaveLength(1);
  expect(visiblePrimaryScrollOwners()[0]).toHaveAttribute(
    "data-scroll-owner",
    "settings",
  );
  const back = screen.getByRole("button", { name: "Back to notes" });
  await vi.waitFor(() => expect(back).toHaveFocus());

  await user.click(back);
  expect(
    screen.getByRole("searchbox", { name: "Search notes" }),
  ).toHaveFocus();
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
  globalThis.location.hash = "";
  onboardingMock.mode = "grant";
  onboardingMock.mounts = 0;
  onboardingMock.pendingAction = null;
  onboardingMock.operationError = null;
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  scrollIntoView.mockReset();
  execute.mockReset().mockResolvedValue(true);
  undo.mockReset().mockResolvedValue(true);
  retryLastAction.mockReset().mockResolvedValue(true);
  clearError.mockReset();
  setPinned.mockReset().mockResolvedValue({
    ok: true,
    value: { ...document, window: { ...document.window, pinned: true } },
  });
  mockedUseKopperDocument.mockReturnValue(contextValue());
  captureOutcomeListener = undefined;
  openSettingsListener = undefined;
  window.kopper = {
    onCaptureOutcome: vi.fn((listener) => {
      captureOutcomeListener = listener;
      return vi.fn();
    }),
    onOpenSettings: vi.fn((listener) => {
      openSettingsListener = listener;
      return vi.fn();
    }),
    openEditorWindow: vi.fn(),
    copyNotes: vi.fn(),
    setPinned,
  } as never;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Default theme App", () => {
  it("gates only the loaded normal panel and continues without a false grant", async () => {
    onboardingMock.mode = "hold";
    const user = userEvent.setup();
    const view = render(<App />);

    expect(
      screen.getByRole("heading", { name: "Accessibility onboarding" }),
    ).toBeVisible();
    expect(screen.queryByText("Captured note")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Continue mock without capture" }),
    );
    expect(screen.getByText("Captured note")).toBeVisible();
    const accessAlert = screen.getByLabelText("Capture access");
    expect(screen.getByText("Capture unavailable")).toBeVisible();
    expect(accessAlert).toHaveTextContent(
      "macOS must approve this Kopper build. Repair access, then enable Kopper in System Settings.",
    );
    expect(Array.from(accessAlert.children).map((child) => child.getAttribute("data-slot"))).toEqual([
      "alert-title",
      "alert-description",
    ]);
    expect(
      screen.getByRole("button", { name: "Open Settings" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Repair access" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Check access" })).not.toBeInTheDocument();

    view.unmount();
    onboardingMock.mode = "hold";
    mockedUseKopperDocument.mockReturnValue(
      contextValue({
        ready: false,
        error: {
          code: "read_failed",
          message: "Could not read the store.",
          retryable: true,
          recoveryAction: "retry",
        },
      }),
    );
    render(<App />);
    expect(
      screen.queryByRole("heading", { name: "Accessibility onboarding" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Kopper needs recovery" }),
    ).toBeVisible();
    expect(onboardingMock.mounts).toBe(2);
  });

  it("lets expanded editor windows bypass capture onboarding", () => {
    onboardingMock.mode = "hold";
    globalThis.location.hash = "#editor=note-1";
    render(<App />);

    expect(
      screen.queryByRole("heading", { name: "Accessibility onboarding" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Edit note" })).toBeVisible();
    const header = screen.getByRole("banner");
    const editorOwner = globalThis.document.querySelector(
      '[data-scroll-owner="editor"]',
    );
    expect(header).toHaveClass("flex-wrap");
    expect(editorOwner).toBeVisible();
    expect(editorOwner).not.toContainElement(header);
    expect(visiblePrimaryScrollOwners()).toEqual([editorOwner]);
    expect(onboardingMock.mounts).toBe(0);
  });

  it("announces compact repair and Settings progress without exposing controls", async () => {
    onboardingMock.mode = "hold";
    onboardingMock.pendingAction = "repair";
    const user = userEvent.setup();
    const view = render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Continue mock without capture" }),
    );

    expect(screen.getByText("Repairing access…")).toBeVisible();
    expect(screen.getByRole("button", { name: "Repair access" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open Settings" })).toBeDisabled();

    onboardingMock.pendingAction = "open-settings";
    view.rerender(<App />);
    expect(screen.getByText("Opening Settings…")).toBeVisible();

    onboardingMock.pendingAction = null;
    onboardingMock.operationError = "Kopper could not reset Accessibility access.";
    view.rerender(<App />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Kopper could not reset Accessibility access.",
    );
    expect(screen.getByRole("button", { name: "Repair access" })).toBeEnabled();
  });

  it("keeps panel-owned controls out of expanded editor loading and failure states", () => {
    globalThis.location.hash = "#editor=note-1";
    mockedUseKopperDocument.mockReturnValue(
      contextValue({ ready: false, pendingAction: "load" }),
    );
    const view = render(<App />);

    const loadingNote = screen.getByRole("progressbar", {
      name: "Loading note",
    });
    expect(loadingNote).toBeVisible();
    expect(loadingNote).not.toHaveAttribute("aria-valuenow");
    expect(
      screen.queryByRole("button", { name: "Hide Kopper" }),
    ).not.toBeInTheDocument();

    mockedUseKopperDocument.mockReturnValue(
      contextValue({
        ready: false,
        pendingAction: null,
        error: {
          code: "read_failed",
          message: "Could not read the store.",
          retryable: true,
          recoveryAction: "retry",
        },
      }),
    );
    view.rerender(<App />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not read the store.",
    );
    expect(
      screen.queryByRole("button", { name: "Hide Kopper" }),
    ).not.toBeInTheDocument();
  });

  it("renders compact lifecycle tabs without a lifecycle rail", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.getByRole("searchbox", { name: "Search notes" }),
    ).toBeVisible();
    expect(
      screen
        .getByRole("button", { name: "Panel menu" })
        .querySelector('[data-icon="vertical-overflow"]'),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("button", { name: "Manage Inbox" })
        .querySelector('[data-icon="vertical-overflow"]'),
    ).toBeInTheDocument();
    const lifecycleTabs = screen.getByRole("tablist", {
      name: "Note lifecycle view",
    });
    const activeView = screen.getByRole("tab", { name: "Active notes" });
    const completedView = screen.getByRole("tab", {
      name: "Completed notes",
    });
    expect(lifecycleTabs).toBeVisible();
    expect(activeView).toHaveAttribute("aria-selected", "true");
    expect(completedView).toHaveAttribute("aria-selected", "false");
    const tabPanels = screen.getAllByRole("tabpanel", { hidden: true });
    expect(tabPanels).toHaveLength(2);
    expect(tabPanels[0]).not.toHaveAttribute("hidden");
    expect(tabPanels[1]).toHaveAttribute("hidden");
    await user.click(activeView);
    expect(activeView).toHaveAttribute("aria-selected", "true");
    expect(completedView).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeVisible();
    expect(screen.getByText("Captured note")).toBeVisible();
    expect(screen.getByText("Completed note")).not.toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "Add a note or prompt" }),
    ).toBeEnabled();

    activeView.focus();
    await user.keyboard("{ArrowRight}");
    expect(completedView).toHaveFocus();
    expect(activeView).toHaveAttribute("aria-selected", "false");
    expect(completedView).toHaveAttribute("aria-selected", "true");
    expect(tabPanels[0]).toHaveAttribute("hidden");
    expect(tabPanels[1]).not.toHaveAttribute("hidden");
    expect(screen.getByText("Captured note")).not.toBeVisible();
    expect(screen.getByText("Completed note")).toBeVisible();

    await user.keyboard("{Home}");
    expect(activeView).toHaveFocus();
    expect(activeView).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(completedView).toHaveFocus();
    expect(completedView).toHaveAttribute("aria-selected", "true");

    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add section" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Lifecycle: captured to completed"),
    ).not.toBeInTheDocument();
    expect(
      globalThis.document.querySelector("[data-lifecycle-rail]"),
    ).not.toBeInTheDocument();
    expect(
      globalThis.document.querySelector("[data-panel-drag-region]"),
    ).toHaveAttribute("aria-hidden", "true");
  });

  it("preserves independent tab working state while keeping hidden panels inert", async () => {
    const user = userEvent.setup();
    render(<App />);

    const activeTab = screen.getByRole("tab", { name: "Active notes" });
    const completedTab = screen.getByRole("tab", { name: "Completed notes" });
    const activeCard = screen.getByRole("option", {
      name: "Note: Captured note",
    });
    await user.click(activeCard);
    fireEvent.keyDown(activeCard, { key: "Enter" });
    const editor = screen.getByRole("textbox", { name: "Edit note" });
    await user.clear(editor);
    await user.type(editor, "Unsaved active draft");
    await user.type(
      screen.getByRole("textbox", { name: "Add a note or prompt" }),
      "Composer draft",
    );
    const activeScrollViewport = visiblePrimaryScrollOwners()[0]?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    expect(activeScrollViewport).toBeDefined();
    if (activeScrollViewport !== null && activeScrollViewport !== undefined) {
      activeScrollViewport.scrollTop = 48;
    }

    await user.click(completedTab);
    const completedCard = screen.getByRole("option", {
      name: "Note: Completed note",
    });
    await user.click(completedCard);
    expect(completedCard).toHaveAttribute("aria-selected", "true");
    expect(visiblePrimaryScrollOwners()).toHaveLength(1);

    await user.click(activeTab);
    expect(screen.getByRole("textbox", { name: "Edit note" })).toHaveValue(
      "Unsaved active draft",
    );
    expect(
      screen.getByRole("textbox", { name: "Add a note or prompt" }),
    ).toHaveValue("Composer draft");
    expect(
      screen.getByRole("option", { name: "Note: Captured note" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(activeScrollViewport).toHaveProperty("scrollTop", 48);

    await user.click(completedTab);
    expect(
      screen.getByRole("option", { name: "Note: Completed note" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(visiblePrimaryScrollOwners()).toHaveLength(1);
  });

  it("keeps focus on lifecycle tab triggers when activating preserved panels", async () => {
    const user = userEvent.setup();
    render(<App />);

    const activeTab = screen.getByRole("tab", { name: "Active notes" });
    const completedTab = screen.getByRole("tab", { name: "Completed notes" });
    await user.click(
      screen.getByRole("option", { name: "Note: Captured note" }),
    );
    await user.click(completedTab);
    await user.click(
      screen.getByRole("option", { name: "Note: Completed note" }),
    );

    completedTab.focus();
    await user.keyboard("{ArrowLeft}");
    expect(activeTab).toHaveFocus();
    expect(activeTab).toHaveAttribute("aria-selected", "true");

    activeTab.focus();
    await user.keyboard("{End}");
    expect(completedTab).toHaveFocus();
    expect(completedTab).toHaveAttribute("aria-selected", "true");

    completedTab.focus();
    await user.keyboard("{Home}");
    expect(activeTab).toHaveFocus();
    expect(activeTab).toHaveAttribute("aria-selected", "true");
  });

  it("highlights only the matching visible active card for 1800ms", () => {
    vi.useFakeTimers();
    render(<App />);
    act(() => {
      captureOutcomeListener?.({ status: "captured", noteId: "note-1" });
    });
    expect(
      screen.getByRole("option", { name: "Note: Captured note" }),
    ).toHaveAttribute("data-capture-highlighted", "true");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1800));
    expect(
      screen.getByRole("option", { name: "Note: Captured note" }),
    ).toHaveAttribute("data-capture-highlighted", "false");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("replaces notes with Appearance settings and restores menu focus on Back", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(visiblePrimaryScrollOwners()).toHaveLength(1);
    expect(visiblePrimaryScrollOwners()[0]).toHaveAttribute(
      "data-scroll-owner",
      "notes",
    );
    const trigger = screen.getByRole("button", { name: "Panel menu" });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Settings…" }));

    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Appearance" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.queryByRole("searchbox", { name: "Search notes" }),
    ).not.toBeInTheDocument();
    expect(visiblePrimaryScrollOwners()).toHaveLength(1);
    expect(visiblePrimaryScrollOwners()[0]).toHaveAttribute(
      "data-scroll-owner",
      "settings",
    );

    await user.click(screen.getByRole("button", { name: "Back to notes" }));
    expect(
      screen.getByRole("searchbox", { name: "Search notes" }),
    ).toBeVisible();
    expect(trigger).toHaveFocus();
  });

  it("closes the panel dropdown before native Shortcuts Settings", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Panel menu" }));
    await expectNativeSettingsOwnsSurface(user, screen.getByRole("menu"));
  });

  it("closes Add Section before native Shortcuts Settings", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Panel menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Add section" }));
    await expectNativeSettingsOwnsSurface(
      user,
      screen.getByRole("dialog", { name: "Add section" }),
    );
  });

  it("closes the section dropdown before native Shortcuts Settings", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Manage Inbox" }));
    await expectNativeSettingsOwnsSurface(user, screen.getByRole("menu"));
  });

  it("closes section rename before native Shortcuts Settings", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Manage Inbox" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    await expectNativeSettingsOwnsSurface(
      user,
      screen.getByRole("dialog", { name: "Rename section" }),
    );
  });

  it("closes section deletion before native Shortcuts Settings", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Manage Inbox" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await expectNativeSettingsOwnsSurface(
      user,
      screen.getByRole("alertdialog", { name: "Delete Inbox?" }),
    );
  });

  it("closes note context menus and submenus before native Shortcuts Settings", async () => {
    const user = userEvent.setup();
    render(<App />);

    fireEvent.contextMenu(
      screen.getByRole("option", { name: "Note: Captured note" }),
    );
    const moveTo = screen.getByRole("menuitem", { name: "Move to" });
    moveTo.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getAllByRole("menu")).toHaveLength(2);
    await expectNativeSettingsOwnsSurface(user, screen.getAllByRole("menu")[1]);
  });

  it("closes Markdown discard without losing editing, selection, or composer state", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(
      screen.getByRole("textbox", { name: "Add a note or prompt" }),
      "Local composer draft",
    );
    fireEvent.contextMenu(
      screen.getByRole("option", { name: "Note: Captured note" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const editor = screen.getByRole("textbox", { name: "Edit note" });
    await user.clear(editor);
    await user.type(editor, "Unsaved editor draft");
    await user.keyboard("{Escape}");
    const discard = screen.getByRole("alertdialog", {
      name: "Discard your unsaved changes?",
    });
    expect(
      screen.queryByRole("button", { name: "Hide Kopper" }),
    ).not.toBeInTheDocument();

    await expectNativeSettingsOwnsSurface(user, discard);

    expect(screen.getByRole("textbox", { name: "Edit note" })).toHaveValue(
      "Unsaved editor draft",
    );
    expect(
      screen.getByRole("textbox", { name: "Add a note or prompt" }),
    ).toHaveValue("Local composer draft");
    expect(
      screen.getByRole("option", { name: "Note: Captured note" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("opens native Settings on Shortcuts and restores Search focus with Escape", async () => {
    render(<App />);

    act(() => openSettingsListener?.());

    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Shortcuts" })).toHaveAttribute(
      "data-state",
      "active",
    );
    fireEvent.keyDown(window, { key: "Escape" });

    await vi.waitFor(() =>
      expect(
        screen.getByRole("searchbox", { name: "Search notes" }),
      ).toHaveFocus(),
    );
  });

  it("preserves the search query and Completed view across Settings", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Completed notes" }));
    await user.type(
      screen.getByRole("searchbox", { name: "Search notes" }),
      "Completed",
    );
    await user.click(screen.getByRole("button", { name: "Panel menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Settings…" }));
    await user.click(screen.getByRole("button", { name: "Back to notes" }));

    expect(screen.getByRole("searchbox", { name: "Search notes" })).toHaveValue(
      "Completed",
    );
    expect(
      screen.getByRole("tab", { name: "Completed notes" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Completed note")).toBeVisible();
  });

  it("preserves note selection and the latest local composer draft across Settings", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("option", { name: "Note: Captured note" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Add a note or prompt" }),
      "Local draft",
    );
    await user.click(screen.getByRole("button", { name: "Panel menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Settings…" }));
    await user.click(screen.getByRole("button", { name: "Back to notes" }));

    expect(
      screen.getByRole("option", { name: "Note: Captured note" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("textbox", { name: "Add a note or prompt" }),
    ).toHaveValue("Local draft");
  });

  it("moves from the initial tabbable card and extends selection from that card", () => {
    const activeDocument: KopperDocument = {
      ...document,
      notes: [
        document.notes[0],
        {
          ...document.notes[1],
          body: "Second active note",
          completedAt: null,
          previousPlacement: null,
        },
      ],
    };
    mockedUseKopperDocument.mockReturnValue(
      contextValue({ document: activeDocument }),
    );

    const firstRender = render(<App />);
    const firstCard = screen.getByRole("option", {
      name: "Note: Captured note",
    });
    const secondCard = screen.getByRole("option", {
      name: "Note: Second active note",
    });
    expect(firstCard).toHaveAttribute("tabindex", "0");

    firstCard.focus();
    fireEvent.keyDown(firstCard, { key: "ArrowDown" });
    expect(secondCard).toHaveFocus();

    firstRender.unmount();
    render(<App />);
    const initialCard = screen.getByRole("option", {
      name: "Note: Captured note",
    });
    const extendedCard = screen.getByRole("option", {
      name: "Note: Second active note",
    });
    initialCard.focus();
    fireEvent.keyDown(initialCard, { key: "ArrowDown", shiftKey: true });

    expect(extendedCard).toHaveFocus();
    expect(initialCard).toHaveAttribute("aria-selected", "true");
    expect(extendedCard).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("2 selected · ⌘C copy · Space done")).toBeVisible();
  });

  it("selects only the filtered current view on repeated Cmd+A and Ctrl+A", async () => {
    const user = userEvent.setup();
    const activeDocument: KopperDocument = {
      ...document,
      notes: [
        { ...document.notes[0], body: "Match active one" },
        {
          ...document.notes[0],
          id: "active-2",
          body: "Match active two",
          order: 1,
        },
        {
          ...document.notes[0],
          id: "active-hidden",
          body: "Hidden active",
          order: 2,
        },
        { ...document.notes[1], body: "Match completed" },
        {
          ...document.notes[1],
          id: "completed-hidden",
          body: "Hidden completed",
          order: 2,
        },
      ],
    };
    mockedUseKopperDocument.mockReturnValue(
      contextValue({ document: activeDocument }),
    );
    render(<App />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search notes" }), {
      target: { value: "Match" },
    });
    const activeToggle = screen.getByRole("tab", { name: "Active notes" });
    activeToggle.focus();
    fireEvent.keyDown(window, { key: "a", metaKey: true });

    const firstActive = screen.getByRole("option", {
      name: "Note: Match active one",
    });
    const secondActive = screen.getByRole("option", {
      name: "Note: Match active two",
    });
    expect(firstActive).toHaveAttribute("aria-selected", "true");
    expect(secondActive).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Hidden active")).not.toBeInTheDocument();

    fireEvent.click(firstActive);
    expect(secondActive).toHaveAttribute("aria-selected", "false");
    activeToggle.focus();
    fireEvent.keyDown(window, { key: "A", ctrlKey: true });
    expect(secondActive).toHaveAttribute("aria-selected", "true");

    const completedToggle = screen.getByRole("tab", {
      name: "Completed notes",
    });
    await user.click(completedToggle);
    completedToggle.focus();
    fireEvent.keyDown(window, { key: "a", metaKey: true });
    expect(
      screen.getByRole("option", { name: "Note: Match completed" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Hidden completed")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search notes" }), {
      target: { value: "No result" },
    });
    completedToggle.focus();
    fireEvent.keyDown(window, { key: "a", metaKey: true });
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search notes" }), {
      target: { value: "Match" },
    });
    expect(
      screen.getByRole("option", { name: "Note: Match completed" }),
    ).toHaveAttribute("aria-selected", "false");
  });

  it("restores focus to the nearest card when the focused card is completed or deleted", () => {
    const activeNotes = [
      document.notes[0],
      {
        ...document.notes[0],
        id: "note-2",
        body: "Middle note",
        order: 1,
      },
      {
        ...document.notes[0],
        id: "note-3",
        body: "Last note",
        order: 2,
      },
    ];
    const activeDocument = { ...document, notes: activeNotes };
    mockedUseKopperDocument.mockReturnValue(
      contextValue({ document: activeDocument }),
    );
    const firstRender = render(<App />);
    const middleCard = screen.getByRole("option", {
      name: "Note: Middle note",
    });
    middleCard.focus();
    fireEvent.click(middleCard);
    fireEvent.keyDown(middleCard, { key: " " });
    expect(execute).toHaveBeenCalledWith({
      type: "note.complete",
      noteIds: ["note-2"],
    });

    mockedUseKopperDocument.mockReturnValue(
      contextValue({
        document: {
          ...activeDocument,
          notes: activeNotes.filter(({ id }) => id !== "note-2"),
        },
      }),
    );
    firstRender.rerender(<App />);
    expect(
      screen.getByRole("option", { name: "Note: Last note" }),
    ).toHaveFocus();

    firstRender.unmount();
    execute.mockClear();
    mockedUseKopperDocument.mockReturnValue(
      contextValue({ document: activeDocument }),
    );
    const secondRender = render(<App />);
    const lastCard = screen.getByRole("option", { name: "Note: Last note" });
    lastCard.focus();
    fireEvent.click(lastCard);
    fireEvent.keyDown(lastCard, { key: "Delete" });
    expect(execute).toHaveBeenCalledWith({
      type: "note.delete",
      noteIds: ["note-3"],
    });

    mockedUseKopperDocument.mockReturnValue(
      contextValue({
        document: {
          ...activeDocument,
          notes: activeNotes.filter(({ id }) => id !== "note-3"),
        },
      }),
    );
    secondRender.rerender(<App />);
    expect(
      screen.getByRole("option", { name: "Note: Middle note" }),
    ).toHaveFocus();
  });

  it("prefers the removed nested-control owner's nearest survivor over stale logical focus", () => {
    const activeNotes = [
      document.notes[0],
      {
        ...document.notes[0],
        id: "note-2",
        body: "Middle note",
        order: 1,
      },
      {
        ...document.notes[0],
        id: "note-3",
        body: "Last note",
        order: 2,
      },
    ];
    const activeDocument = { ...document, notes: activeNotes };
    mockedUseKopperDocument.mockReturnValue(
      contextValue({ document: activeDocument }),
    );
    const view = render(<App />);

    fireEvent.click(
      screen.getByRole("option", { name: "Note: Captured note" }),
    );
    screen.getByRole("button", { name: "Mark Middle note as done" }).focus();

    mockedUseKopperDocument.mockReturnValue(
      contextValue({
        document: {
          ...activeDocument,
          notes: activeNotes.filter(({ id }) => id !== "note-2"),
        },
      }),
    );
    view.rerender(<App />);

    expect(
      screen.getByRole("option", { name: "Note: Last note" }),
    ).toHaveFocus();
  });

  it("does not steal external focus when a logically focused card disappears", () => {
    const activeDocument: KopperDocument = {
      ...document,
      notes: [
        document.notes[0],
        {
          ...document.notes[0],
          id: "note-2",
          body: "Second active note",
          order: 1,
        },
      ],
    };
    mockedUseKopperDocument.mockReturnValue(
      contextValue({ document: activeDocument }),
    );
    const view = render(<App />);
    const firstCard = screen.getByRole("option", {
      name: "Note: Captured note",
    });
    fireEvent.click(firstCard);
    const search = screen.getByRole("searchbox", { name: "Search notes" });
    search.focus();

    mockedUseKopperDocument.mockReturnValue(
      contextValue({
        document: { ...activeDocument, notes: [activeDocument.notes[1]] },
      }),
    );
    view.rerender(<App />);

    expect(search).toHaveFocus();
    expect(
      screen.getByRole("option", { name: "Note: Second active note" }),
    ).toHaveAttribute("data-focused", "false");
  });

  it("switches to completed projections, hides the composer, and filters by search", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Completed notes" }));
    expect(screen.getByText("Completed note")).toBeVisible();
    expect(screen.getByText("Captured note")).not.toBeVisible();
    expect(
      screen.queryByRole("textbox", { name: "Add a note or prompt" }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "missing");
    expect(
      screen.queryByRole("heading", { name: "Inbox" }),
    ).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole("tabpanel", { name: "Completed notes" }),
      ).getByText("No notes match “missing”."),
    ).toBeVisible();
  });

  it("directs active and completed empty states toward the next action", async () => {
    const user = userEvent.setup();
    mockedUseKopperDocument.mockReturnValue(
      contextValue({ document: { ...document, notes: [] } }),
    );
    render(<App />);

    expect(
      screen.getByText(
        "No active notes yet. Add a note below or capture text with your shortcut.",
      ),
    ).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Completed notes" }));
    expect(screen.getByText("No completed notes yet.")).toBeVisible();
  });

  it("enters inline editing with Return and saves through note.edit", async () => {
    render(<App />);
    const card = screen.getByRole("option", { name: "Note: Captured note" });
    card.focus();
    fireEvent.keyDown(card, { key: "Enter" });
    const editor = screen.getByRole("textbox", { name: "Edit note" });
    fireEvent.change(editor, { target: { value: "Edited note" } });
    fireEvent.keyDown(editor, { key: "Enter", metaKey: true });

    await vi.waitFor(() =>
      expect(execute).toHaveBeenCalledWith({
        type: "note.edit",
        noteId: "note-1",
        body: "Edited note",
      }),
    );
  });

  it("routes Cmd+K and Cmd+Z through one panel shortcut listener", () => {
    render(<App />);
    const panelMenu = screen.getByRole("button", { name: "Panel menu" });
    panelMenu.focus();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("searchbox")).toHaveFocus();

    panelMenu.focus();
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(undo).toHaveBeenCalledOnce();
  });

  it("keeps low-frequency panel actions in the overflow menu", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Panel menu" }));

    expect(screen.getByRole("menuitem", { name: "Add section" })).toBeVisible();
    const undoMenuItem = screen.getByRole("menuitem", { name: "Undo" });
    expect(undoMenuItem).toBeVisible();
    expect(undoMenuItem).toHaveTextContent("⌘Z");
    expect(
      screen.queryByRole("menuitem", { name: "Pin panel" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Settings…" })).toBeVisible();

    await user.click(undoMenuItem);
    expect(undo).toHaveBeenCalledOnce();
  });

  it("keeps successful pin updates silent while showing failures", async () => {
    const user = userEvent.setup();
    render(<App />);

    const pin = screen.getByRole("button", { name: "Pin panel" });
    expect(pin).toHaveAttribute("data-size", "icon");
    expect(pin).toHaveAttribute("aria-pressed", "false");
    await user.click(pin);
    expect(setPinned).toHaveBeenCalledWith(true);

    expect(
      globalThis.document.querySelector('[data-slot="toast"]'),
    ).not.toBeInTheDocument();

    setPinned.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "write_failed",
        message: "The panel pin could not be saved.",
        retryable: true,
      },
    });
    await user.click(pin);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The panel pin could not be saved.",
    );
  });

  it("exposes persisted pinned state and requests an acknowledged unpin", async () => {
    const user = userEvent.setup();
    mockedUseKopperDocument.mockReturnValue(
      contextValue({
        document: {
          ...document,
          window: { ...document.window, pinned: true },
        },
      }),
    );
    setPinned.mockResolvedValueOnce({
      ok: true,
      value: { ...document, window: { ...document.window, pinned: false } },
    });
    render(<App />);

    const pin = screen.getByRole("button", { name: "Unpin panel" });
    expect(pin).toHaveAttribute("aria-pressed", "true");
    expect(pin.querySelector('[data-icon="pin"]')).toBeInTheDocument();
    await user.click(pin);

    expect(setPinned).toHaveBeenCalledWith(false);
    expect(
      globalThis.document.querySelector('[data-slot="toast"]'),
    ).not.toBeInTheDocument();
  });

  it("disables pin while its native acknowledgement is pending", async () => {
    let acknowledgePin: (() => void) | undefined;
    setPinned.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          acknowledgePin = () =>
            resolve({
              ok: true,
              value: {
                ...document,
                window: { ...document.window, pinned: true },
              },
            });
        }),
    );
    render(<App />);
    const pin = screen.getByRole("button", { name: "Pin panel" });

    fireEvent.click(pin);
    fireEvent.click(pin);

    expect(pin).toBeDisabled();
    expect(setPinned).toHaveBeenCalledOnce();
    await act(async () => acknowledgePin?.());
    expect(pin).toBeEnabled();
  });

  it("renders a persistent structured error with Retry only when retryable", async () => {
    const user = userEvent.setup();
    mockedUseKopperDocument.mockReturnValue(
      contextValue({
        error: {
          code: "write_failed",
          message: "The ledger could not be written.",
          retryable: true,
          recoveryAction: "retry",
        },
      }),
    );
    const { rerender } = render(<App />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The ledger could not be written.");
    expect(alert.closest('[data-panel-shell="true"]')).toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(retryLastAction).toHaveBeenCalledOnce();
    expect(screen.getByText("Captured note")).toBeVisible();

    mockedUseKopperDocument.mockReturnValue(
      contextValue({
        error: {
          code: "validation_failed",
          message: "Invalid action.",
          retryable: false,
        },
      }),
    );
    rerender(<App />);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid action.");
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
  });

  it("lets people dismiss a persistent document error", async () => {
    mockedUseKopperDocument.mockReturnValue(
      contextValue({
        error: {
          code: "validation_failed",
          message: "Invalid action.",
          retryable: false,
        },
      }),
    );
    render(<App />);

    await userEvent.click(
      within(screen.getByRole("alert")).getByRole("button", {
        name: "Dismiss error",
      }),
    );

    expect(clearError).toHaveBeenCalledOnce();
  });

  it("renders a labeled loading progress region", () => {
    mockedUseKopperDocument.mockReturnValue(
      contextValue({ pendingAction: "load" }),
    );
    render(<App />);
    const progress = screen.getByRole("progressbar", {
      name: "Loading notes",
    });
    expect(progress).toBeVisible();
    expect(progress).not.toHaveAttribute("aria-valuenow");
    expect(progress.closest('[data-panel-shell="true"]')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide Kopper" })).toBeVisible();
  });
});
