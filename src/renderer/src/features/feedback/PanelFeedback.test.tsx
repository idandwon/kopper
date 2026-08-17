import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PanelFeedbackProvider, usePanelFeedback } from "./PanelFeedback";

function FeedbackHarness() {
  const {
    reportClipboardResult,
    reportClipboardUnavailable,
    reportNotice,
  } = usePanelFeedback();

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
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("panel feedback", () => {
  it("shows clipboard success in one polite visible toast", () => {
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
    expect(singularStatus).toHaveAttribute("aria-live", "polite");
    expect(singularStatus).toBeVisible();
    expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);
    expect(
      document.querySelectorAll('[data-slot="toast-viewport"]'),
    ).toHaveLength(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Report plural success" }),
    );
    expect(document.querySelector('[data-slot="toast"]')).toHaveTextContent(
      "Copied 2 notes.",
    );
    expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);
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

  it("shows structured and unexpected clipboard failures as alerts", () => {
    const view = render(
      <PanelFeedbackProvider>
        <FeedbackHarness />
      </PanelFeedbackProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Report failure" }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Clipboard is unavailable.");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Report unavailable bridge" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The selected notes could not be copied.",
    );
    view.unmount();
  });
});
