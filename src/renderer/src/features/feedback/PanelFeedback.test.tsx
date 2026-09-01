import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PanelFeedbackProvider, usePanelFeedback } from "./PanelFeedback";

function FeedbackHarness() {
  const {
    dismissNotice,
    reportClipboardResult,
    reportClipboardUnavailable,
    reportNotice,
  } = usePanelFeedback();
  const ownedNoticeId = useRef<number | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() =>
          reportClipboardResult({ ok: true, value: { copiedCount: 1 } })
        }
      >
        Report singular success
      </button>
      <button
        type="button"
        onClick={() =>
          reportClipboardResult({ ok: true, value: { copiedCount: 2 } })
        }
      >
        Report plural success
      </button>
      <button
        type="button"
        onClick={() =>
          reportClipboardResult({
            ok: false,
            error: {
              code: "write_failed",
              message: "Clipboard is unavailable.",
              retryable: true,
            },
          })
        }
      >
        Report failure
      </button>
      <button type="button" onClick={reportClipboardUnavailable}>
        Report unavailable bridge
      </button>
      <button type="button" onClick={() => reportNotice("First notice")}>
        Report first notice
      </button>
      <button type="button" onClick={() => reportNotice("Second notice")}>
        Report second notice
      </button>
      <button
        type="button"
        onClick={() => {
          ownedNoticeId.current = reportNotice("Owned failure", "error");
        }}
      >
        Report owned failure
      </button>
      <button
        type="button"
        onClick={() => {
          if (ownedNoticeId.current !== null) {
            dismissNotice(ownedNoticeId.current);
          }
        }}
      >
        Dismiss owned failure
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function activeLiveRegions(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[aria-live]:not([aria-live="off"]), [role="status"]:not([aria-live="off"]), [role="alert"]:not([aria-live="off"])',
    ),
  );
}

async function expectOneRadixAnnouncement(
  message: string,
  urgency: "polite" | "assertive",
): Promise<void> {
  await waitFor(() => {
    const regions = activeLiveRegions();
    expect(regions).toHaveLength(1);
    expect(regions[0]).toHaveAttribute("role", "status");
    expect(regions[0]).toHaveAttribute("aria-live", urgency);
    expect(regions[0]).toHaveTextContent(message);
  });
}

describe("panel feedback", () => {
  it("shows clipboard success visibly while Radix owns one polite announcement", async () => {
    render(
      <PanelFeedbackProvider>
        <FeedbackHarness />
      </PanelFeedbackProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Report singular success" }),
    );
    const singularStatus = document.querySelector('[data-slot="toast"]');
    expect(singularStatus).toHaveTextContent("Copied note.");
    expect(singularStatus).toHaveAttribute("role", "status");
    expect(singularStatus).toHaveAttribute("aria-live", "off");
    expect(singularStatus).toBeVisible();
    expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);
    expect(
      document.querySelectorAll('[data-slot="toast-viewport"]'),
    ).toHaveLength(1);
    await expectOneRadixAnnouncement("Copied note.", "polite");

    fireEvent.click(
      screen.getByRole("button", { name: "Report plural success" }),
    );
    expect(document.querySelector('[data-slot="toast"]')).toHaveTextContent(
      "Copied 2 notes.",
    );
    expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);
    await expectOneRadixAnnouncement("Copied 2 notes.", "polite");
  });

  it("replaces a notice and resets the one 1800ms timer", () => {
    vi.useFakeTimers();
    render(
      <PanelFeedbackProvider>
        <FeedbackHarness />
      </PanelFeedbackProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Report first notice" }),
    );
    expect(document.querySelector('[data-slot="toast"]')).toHaveTextContent(
      "First notice",
    );
    act(() => vi.advanceTimersByTime(1_799));

    fireEvent.click(
      screen.getByRole("button", { name: "Report second notice" }),
    );
    expect(screen.queryByText("First notice")).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="toast"]')).toHaveTextContent(
      "Second notice",
    );

    act(() => vi.advanceTimersByTime(1_799));
    expect(document.querySelector('[data-slot="toast"]')).toHaveTextContent(
      "Second notice",
    );
    act(() => vi.advanceTimersByTime(1));
    expect(
      document.querySelector('[data-slot="toast"]'),
    ).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("dismisses only the notice whose identity the caller owns", () => {
    render(
      <PanelFeedbackProvider>
        <FeedbackHarness />
      </PanelFeedbackProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Report owned failure" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Owned failure");

    fireEvent.click(
      screen.getByRole("button", { name: "Report singular success" }),
    );
    expect(document.querySelector('[data-slot="toast"]')).toHaveTextContent(
      "Copied note.",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss owned failure" }),
    );
    expect(document.querySelector('[data-slot="toast"]')).toHaveTextContent(
      "Copied note.",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Report owned failure" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss owned failure" }),
    );
    expect(document.querySelector('[data-slot="toast"]')).not.toBeInTheDocument();
  });

  it("cancels the notice timer on provider unmount with no later timer work", () => {
    vi.useFakeTimers();
    const view = render(
      <PanelFeedbackProvider>
        <FeedbackHarness />
      </PanelFeedbackProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Report first notice" }));
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    view.unmount();

    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.runAllTimers());
    expect(vi.getTimerCount()).toBe(0);
    expect(document.querySelector('[data-slot="toast"]')).not.toBeInTheDocument();
  });

  it("cancels the timer when Radix requests onOpenChange(false)", () => {
    vi.useFakeTimers();
    render(
      <PanelFeedbackProvider>
        <FeedbackHarness />
      </PanelFeedbackProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Report first notice" }));
    const toast = document.querySelector<HTMLElement>('[data-slot="toast"]');
    expect(toast).not.toBeNull();
    if (toast !== null) {
      toast.setPointerCapture = vi.fn();
      toast.hasPointerCapture = vi.fn(() => true);
      toast.releasePointerCapture = vi.fn();
      fireEvent.pointerDown(toast, {
        button: 0,
        clientX: 0,
        clientY: 0,
        pointerId: 1,
        pointerType: "mouse",
      });
      fireEvent.pointerMove(toast, {
        clientX: 100,
        clientY: 0,
        pointerId: 1,
        pointerType: "mouse",
      });
      fireEvent.pointerUp(toast, {
        clientX: 100,
        clientY: 0,
        pointerId: 1,
        pointerType: "mouse",
      });
    }

    expect(document.querySelector('[data-slot="toast"]')).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.runAllTimers());
    expect(vi.getTimerCount()).toBe(0);
    expect(document.querySelector('[data-slot="toast"]')).not.toBeInTheDocument();
  });

  it("shows failures visibly while Radix owns one assertive announcement", async () => {
    const view = render(
      <PanelFeedbackProvider>
        <FeedbackHarness />
      </PanelFeedbackProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Report failure" }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Clipboard is unavailable.");
    expect(alert).toHaveAttribute("aria-live", "off");
    expect(alert).toBeVisible();
    await expectOneRadixAnnouncement("Clipboard is unavailable.", "assertive");

    fireEvent.click(
      screen.getByRole("button", { name: "Report unavailable bridge" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The selected notes could not be copied.",
    );
    await expectOneRadixAnnouncement(
      "The selected notes could not be copied.",
      "assertive",
    );
    view.unmount();
  });

  it("keeps errors readable briefly and lets people dismiss them immediately", () => {
    vi.useFakeTimers();
    render(
      <PanelFeedbackProvider>
        <FeedbackHarness />
      </PanelFeedbackProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Report failure" }));
    expect(screen.getByRole("alert")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Dismiss notification" }),
    ).toBeVisible();

    act(() => vi.advanceTimersByTime(3_999));
    expect(screen.getByRole("alert")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("automatically removes an error after four seconds", () => {
    vi.useFakeTimers();
    render(
      <PanelFeedbackProvider>
        <FeedbackHarness />
      </PanelFeedbackProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Report failure" }));
    act(() => vi.advanceTimersByTime(4_000));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });
});
