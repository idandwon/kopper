import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyDocument } from "../../../../shared/domain/document";
import { useKopperDocument } from "../../app/DocumentProvider";
import { ShortcutSettings } from "./ShortcutSettings";

vi.mock("../../app/DocumentProvider", () => ({ useKopperDocument: vi.fn() }));

const document = createEmptyDocument(new Date("2026-08-16T12:00:00.000Z"));

beforeEach(() => {
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
      value: { ...structuredClone(document), window: { ...document.window, pinned: true } },
    }),
  } as never;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ShortcutSettings", () => {
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
      "CommandOrControl+Shift+K",
    );

    await user.click(screen.getByRole("radio", { name: "Double Shift" }));
    expect(screen.getByLabelText("Capture shortcut candidate")).toHaveTextContent(
      "Double Shift",
    );
  });

  it("Escape cancels recording and restores the authoritative preference", async () => {
    render(<ShortcutSettings captureUnavailable={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Record shortcut" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("status")).toHaveTextContent("recording cancelled");
    expect(screen.getByLabelText("Capture shortcut candidate")).toHaveTextContent(
      "Double Shift",
    );
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

  it("uses the dedicated capture API and visibly disables it when unavailable", async () => {
    const { rerender } = render(<ShortcutSettings captureUnavailable={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Test capture" }));
    expect(window.kopper.requestCapture).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "No selected text was found.",
    );

    rerender(<ShortcutSettings captureUnavailable />);
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
