import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyDocument } from "../../../../shared/domain/document";
import { useKopperDocument } from "../../app/DocumentProvider";
import { ShortcutSettings as ShortcutSettingsSurface } from "./ShortcutSettings";

vi.mock("../../app/DocumentProvider", () => ({ useKopperDocument: vi.fn() }));

const document = createEmptyDocument(new Date("2026-08-16T12:00:00.000Z"));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function ShortcutSettings({
  captureUnavailable,
}: {
  captureUnavailable: boolean;
}) {
  return (
    <ShortcutSettingsSurface
      active
      captureUnavailable={captureUnavailable}
    />
  );
}

function publish(nextDocument = document) {
  vi.mocked(useKopperDocument).mockReturnValue({
    document: nextDocument,
    ready: true,
    pendingAction: null,
    error: null,
    execute: vi.fn(),
    undo: vi.fn(),
    retryLastAction: vi.fn(),
    clearError: vi.fn(),
  });
}

beforeEach(() => {
  publish();
  window.kopper = {
    validateShortcuts: vi.fn().mockResolvedValue({
      ok: true,
      value: { valid: true },
    }),
    saveShortcuts: vi.fn().mockImplementation(async (preferences) => ({
      ok: true,
      value: { ...structuredClone(document), shortcuts: preferences },
    })),
    requestCapture: vi.fn().mockResolvedValue({ status: "empty" }),
    setPinned: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        ...structuredClone(document),
        window: { ...document.window, pinned: true },
      },
    }),
  } as never;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ShortcutSettings", () => {
  it("uses a named radio group and cancels shortcut recording with Escape", async () => {
    render(<ShortcutSettings captureUnavailable={false} />);

    expect(
      screen.getByRole("radiogroup", { name: "Capture selection" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Keyboard shortcut" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Record shortcut" }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Shortcut recording cancelled.",
    );
  });

  it("selects Double Shift or records an immutable accelerator candidate", async () => {
    const user = userEvent.setup();
    render(<ShortcutSettings captureUnavailable={false} />);
    await user.click(screen.getByRole("button", { name: "Record shortcut" }));
    fireEvent.keyDown(window, { key: "Shift", shiftKey: true });
    expect(screen.getByRole("button", { name: "Recording…" })).toBeInTheDocument();
    fireEvent.keyDown(window, {
      key: "k",
      metaKey: true,
      shiftKey: true,
    });
    expect(screen.getByLabelText("Capture shortcut candidate")).toHaveTextContent(
      "Command+Shift+K",
    );

    await user.click(screen.getByRole("radio", { name: "Double Shift" }));
    expect(screen.getByLabelText("Capture shortcut candidate")).toHaveTextContent(
      "Double Shift",
    );
  });

  it("records Command and Control distinctly, including both with Alt and Shift", async () => {
    render(<ShortcutSettings captureUnavailable={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Record shortcut" }));
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByLabelText("Capture shortcut candidate")).toHaveTextContent("Control+K");

    await userEvent.click(screen.getByRole("button", { name: "Record shortcut" }));
    fireEvent.keyDown(window, {
      key: "k",
      metaKey: true,
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
    });
    expect(screen.getByLabelText("Capture shortcut candidate")).toHaveTextContent(
      "Command+Control+Alt+Shift+K",
    );
  });

  it("ignores modifier-only keys and Escape keeps the pre-recording candidate", async () => {
    render(<ShortcutSettings captureUnavailable={false} />);
    const toggle = screen.getByLabelText("Toggle panel");
    await userEvent.clear(toggle);
    await userEvent.type(toggle, "Control+Alt+P");
    await userEvent.click(screen.getByRole("button", { name: "Record shortcut" }));
    fireEvent.keyDown(window, { key: "Meta", metaKey: true });
    fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Recording…" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("status")).toHaveTextContent("recording cancelled");
    expect(toggle).toHaveValue("Control+Alt+P");
  });

  it("preserves an unsaved candidate and recording across unrelated document publication", async () => {
    const { rerender } = render(<ShortcutSettings captureUnavailable={false} />);
    const toggle = screen.getByLabelText("Toggle panel");
    await userEvent.clear(toggle);
    await userEvent.type(toggle, "Command+Alt+U");
    await userEvent.click(screen.getByRole("button", { name: "Record shortcut" }));

    const unrelated = structuredClone(document);
    unrelated.notes.push({
      id: "note-2",
      sectionId: unrelated.sections[0]!.id,
      body: "unrelated",
      order: 0,
      createdAt: unrelated.sections[0]!.createdAt,
      updatedAt: unrelated.sections[0]!.updatedAt,
      completedAt: null,
      previousPlacement: null,
    });
    publish(unrelated);
    rerender(<ShortcutSettings captureUnavailable={false} />);

    expect(toggle).toHaveValue("Command+Alt+U");
    expect(screen.getByRole("button", { name: "Recording…" })).toBeInTheDocument();
  });

  it("reconciles the candidate when authoritative shortcut values actually change", async () => {
    const { rerender } = render(<ShortcutSettings captureUnavailable={false} />);
    const toggle = screen.getByLabelText("Toggle panel");
    await userEvent.clear(toggle);
    await userEvent.type(toggle, "Command+Alt+U");

    const changed = structuredClone(document);
    changed.shortcuts.togglePanel = "Control+Shift+P";
    publish(changed);
    rerender(<ShortcutSettings captureUnavailable={false} />);

    expect(toggle).toHaveValue("Control+Shift+P");
  });

  it("keeps a conflicting candidate unsaved with accessible fixed feedback", async () => {
    vi.mocked(window.kopper.validateShortcuts).mockResolvedValueOnce({
      ok: false,
      error: {
        code: "shortcut_conflict",
        message: "Capture and panel shortcuts must be different.",
        retryable: false,
      },
    });
    render(<ShortcutSettings captureUnavailable={false} />);
    const toggle = screen.getByLabelText("Toggle panel");
    await userEvent.clear(toggle);
    await userEvent.type(toggle, "CommandOrControl+Shift+C");
    await userEvent.click(screen.getByRole("button", { name: "Save shortcuts" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Capture and panel shortcuts must be different.",
    );
    expect(window.kopper.saveShortcuts).not.toHaveBeenCalled();
    expect(toggle).toHaveValue("CommandOrControl+Shift+C");
  });

  it("resets through the same acknowledged save transaction", async () => {
    render(<ShortcutSettings captureUnavailable={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(window.kopper.saveShortcuts).toHaveBeenCalledWith({
        capture: { kind: "double-modifier", modifier: "shift" },
        togglePanel: "CommandOrControl+Shift+Space",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Shortcuts reset to defaults.",
    );
  });

  it("uses dedicated pending state, disables repeat tests, and announces the fixed result", async () => {
    const pending = deferred<{ status: "empty" }>();
    vi.mocked(window.kopper.requestCapture).mockReturnValueOnce(pending.promise);
    render(<ShortcutSettings captureUnavailable={false} />);
    const testButton = screen.getByRole("button", { name: "Test capture" });

    await userEvent.click(testButton);
    expect(testButton).toBeDisabled();
    expect(testButton).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Testing capture…");
    await userEvent.click(testButton);
    expect(window.kopper.requestCapture).toHaveBeenCalledOnce();

    await act(async () => pending.resolve({ status: "empty" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "No selected text was found.",
    );
    expect(testButton).not.toBeDisabled();
    expect(testButton).toHaveAttribute("aria-busy", "false");
  });

  it("handles rejected Test Capture safely and restores the test control", async () => {
    const pending = deferred<{ status: "empty" }>();
    vi.mocked(window.kopper.requestCapture).mockReturnValueOnce(pending.promise);
    render(<ShortcutSettings captureUnavailable={false} />);
    const testButton = screen.getByRole("button", { name: "Test capture" });
    await userEvent.click(testButton);

    await act(async () => pending.reject(new Error("private IPC detail")));

    expect(screen.getByRole("status")).toHaveTextContent("Test capture could not run.");
    expect(screen.getByRole("status")).not.toHaveTextContent("private IPC detail");
    expect(testButton).not.toBeDisabled();
  });

  it("visibly disables Test Capture when capture is unavailable", () => {
    render(<ShortcutSettings captureUnavailable />);
    expect(screen.getByRole("button", { name: "Test capture" })).toBeDisabled();
    expect(screen.getByText(/Capture is unavailable/)).toBeInTheDocument();
  });

  it("shows pin state only from an acknowledged native+persistence result", async () => {
    vi.mocked(window.kopper.setPinned).mockResolvedValueOnce({
      ok: false,
      error: {
        code: "write_failed",
        message: "Pin could not be saved.",
        retryable: true,
      },
    });
    render(<ShortcutSettings captureUnavailable={false} />);
    const pin = screen.getByRole("button", { name: "Pin panel" });
    await userEvent.click(pin);
    expect(pin).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Pin could not be saved.",
    );
  });
});
