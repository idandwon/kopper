import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CaptureOutcome, KopperApi } from "../../../../shared/ipc/contract";
import { CaptureToast } from "./CaptureToast";

let emit: ((outcome: CaptureOutcome) => void) | undefined;
const unsubscribe = vi.fn();
const onCaptureOutcome = vi.fn((listener: (outcome: CaptureOutcome) => void) => {
  emit = listener;
  return unsubscribe;
});

beforeEach(() => {
  vi.useFakeTimers();
  emit = undefined;
  unsubscribe.mockReset();
  onCaptureOutcome.mockClear();
  window.kopper = { onCaptureOutcome } as unknown as KopperApi;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function outcome(value: CaptureOutcome): void {
  act(() => emit?.(value));
}

describe("CaptureToast", () => {
  it.each([
    [{ status: "captured", noteId: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5" }, "Captured"],
    [{ status: "empty" }, "Nothing selected"],
    [{ status: "failed", error: { code: "capture_timeout", message: "ignored", retryable: true } }, "The source app did not provide text"],
    [{ status: "failed", error: { code: "permission_denied", message: "ignored", retryable: true } }, "Capture needs Accessibility access"],
    [{ status: "failed", error: { code: "write_failed", message: "ignored", retryable: true } }, "Captured text could not be saved"],
    [{ status: "failed", error: { code: "capture_failed", message: "ignored", retryable: true } }, "Kopper could not capture the selection."],
  ] as const)("shows a nonfocusing status for %j", (event, copy) => {
    render(<CaptureToast />);
    outcome(event as CaptureOutcome);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(copy);
    expect(status).not.toHaveAttribute("tabindex");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("dismisses after exactly 1800ms and new outcomes replace/reset the one timer", () => {
    render(<CaptureToast />);
    outcome({ status: "empty" });
    act(() => vi.advanceTimersByTime(1799));
    expect(screen.getByText("Nothing selected")).toBeVisible();
    outcome({ status: "captured", noteId: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5" });
    expect(screen.queryByText("Nothing selected")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1799));
    expect(screen.getByText("Captured")).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("publishes highlight changes without rendering an in-panel notice", () => {
    const onHighlightedNoteChange = vi.fn();
    render(
      <CaptureToast
        displayNotice={false}
        onHighlightedNoteChange={onHighlightedNoteChange}
      />,
    );

    outcome({
      status: "captured",
      noteId: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(onHighlightedNoteChange).toHaveBeenCalledWith(
      "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
    );
  });

  it("highlights only a captured ID for the same timer and cleans subscription/timer", () => {
    const onHighlightedNoteChange = vi.fn();
    const view = render(
      <CaptureToast onHighlightedNoteChange={onHighlightedNoteChange} />,
    );
    expect(onCaptureOutcome).toHaveBeenCalledOnce();
    outcome({ status: "captured", noteId: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5" });
    expect(onHighlightedNoteChange).toHaveBeenLastCalledWith(
      "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
    );
    outcome({ status: "empty" });
    expect(onHighlightedNoteChange).toHaveBeenLastCalledWith(null);
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
