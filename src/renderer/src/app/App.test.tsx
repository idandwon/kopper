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
        operationError: null,
        pendingAction: null,
        checkAccess: async () => undefined,
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
  appearance: { mode: "system", activeThemeId: "oxide-ledger" },
  customThemes: [],
  draft: null,
};

const mockedUseKopperDocument = vi.mocked(useKopperDocument);
const execute = vi.fn<KopperDocumentContextValue["execute"]>();
const undo = vi.fn<KopperDocumentContextValue["undo"]>();
const retryLastAction = vi.fn<KopperDocumentContextValue["retryLastAction"]>();
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
    clearError: vi.fn(),
    ...overrides,
  };
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
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  scrollIntoView.mockReset();
  execute.mockReset().mockResolvedValue(true);
  undo.mockReset().mockResolvedValue(true);
  retryLastAction.mockReset().mockResolvedValue(true);
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

describe("Oxide Ledger App", () => {
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
    expect(screen.getByRole("status")).toHaveTextContent(
      "Capture unavailable — Accessibility access has not been granted.",
    );
    expect(
      screen.getByRole("button", { name: "Open System Settings" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Check access" })).toBeVisible();

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

  it("renders the interactive active panel and lifecycle rail", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.getByRole("searchbox", { name: "Search notes" }),
    ).toBeVisible();
    const lifecycleGroup = screen.getByRole("group", {
      name: "Note lifecycle view",
    });
    const activeView = screen.getByRole("button", { name: "Active notes" });
    const completedView = screen.getByRole("button", {
      name: "Completed notes",
    });
    expect(lifecycleGroup).toHaveAttribute("data-slot", "toggle-group");
    expect(activeView).toHaveAttribute("data-slot", "toggle-group-item");
    expect(activeView).toHaveAttribute("aria-pressed", "true");
    expect(completedView).toHaveAttribute("aria-pressed", "false");
    await user.click(activeView);
    expect(activeView).toHaveAttribute("aria-pressed", "true");
    expect(completedView).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeVisible();
    expect(screen.getByText("Captured note")).toBeVisible();
    expect(screen.queryByText("Completed note")).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Add a note or prompt" }),
    ).toBeEnabled();

    await user.click(completedView);
    expect(activeView).toHaveAttribute("aria-pressed", "false");
    expect(completedView).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Captured note")).not.toBeInTheDocument();
    expect(screen.getByText("Completed note")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add section" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Lifecycle: captured to completed"),
    ).toBeInTheDocument();
    expect(
      globalThis.document.querySelector("[data-panel-drag-region]"),
    ).toHaveAttribute("aria-hidden", "true");
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

  it("closes Add Section before native Shortcuts Settings and restores Search focus", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Panel menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Add section" }));
    expect(screen.getByRole("dialog", { name: "Add section" })).toBeVisible();

    act(() => openSettingsListener?.());

    expect(
      screen.queryByRole("dialog", { name: "Add section" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Shortcuts" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.queryByRole("searchbox", { name: "Search notes" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to notes" }));
    expect(
      screen.getByRole("searchbox", { name: "Search notes" }),
    ).toHaveFocus();
    expect(
      screen.queryByRole("dialog", { name: "Add section" }),
    ).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Completed notes" }));
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
      screen.getByRole("button", { name: "Completed notes" }),
    ).toHaveAttribute("aria-pressed", "true");
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

    await user.click(screen.getByRole("button", { name: "Completed notes" }));
    expect(screen.getByText("Completed note")).toBeVisible();
    expect(screen.queryByText("Captured note")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Add a note or prompt" }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "missing");
    expect(
      screen.queryByRole("heading", { name: "Inbox" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("No notes match “missing”.")).toBeVisible();
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

    await user.click(screen.getByRole("button", { name: "Completed notes" }));
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
    expect(screen.getByRole("menuitem", { name: "Pin panel" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Settings…" })).toBeVisible();

    await user.click(undoMenuItem);
    expect(undo).toHaveBeenCalledOnce();
  });

  it("reports pin success and failure through the shared visible feedback", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Panel menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Pin panel" }));

    const status = globalThis.document.querySelector('[data-slot="toast"]');
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveTextContent("Panel pinned.");
    expect(status).toBeVisible();
    expect(
      globalThis.document.querySelectorAll('[data-slot="toast"]'),
    ).toHaveLength(1);

    setPinned.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "write_failed",
        message: "The panel pin could not be saved.",
        retryable: true,
      },
    });
    await user.click(screen.getByRole("button", { name: "Panel menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Pin panel" }));

    expect(
      globalThis.document.querySelector('[data-slot="toast"][role="status"]'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The panel pin could not be saved.",
    );
    expect(
      globalThis.document.querySelectorAll('[data-slot="toast"]'),
    ).toHaveLength(1);
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

  it("renders a labeled loading progress region", () => {
    mockedUseKopperDocument.mockReturnValue(
      contextValue({ pendingAction: "load" }),
    );
    render(<App />);
    const progress = screen.getByRole("progressbar", {
      name: "Loading notes",
    });
    expect(progress).toBeVisible();
    expect(progress.closest('[data-panel-shell="true"]')).toBeInTheDocument();
  });
});
