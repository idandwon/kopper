import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PanelFeedbackProvider, usePanelFeedback } from "./PanelFeedback";

function FeedbackHarness() {
  const { reportClipboardResult, reportClipboardUnavailable } =
    usePanelFeedback();

  return (
    <>
      <button
        type="button"
        onClick={() =>
          reportClipboardResult({ ok: true, value: { copiedCount: 2 } })
        }
      >
        Report success
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
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("panel feedback", () => {
  it("announces an exact clipboard count and clears it after a bounded delay", () => {
    vi.useFakeTimers();
    render(
      <PanelFeedbackProvider>
        <FeedbackHarness />
      </PanelFeedbackProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Report success" }));
    expect(screen.getByRole("status")).toHaveTextContent("Copied 2 notes.");

    act(() => vi.advanceTimersByTime(1_800));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows structured and unexpected clipboard failures as alerts", () => {
    const view = render(
      <PanelFeedbackProvider>
        <FeedbackHarness />
      </PanelFeedbackProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Report failure" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Clipboard is unavailable.",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Report unavailable bridge" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The selected notes could not be copied.",
    );
    view.unmount();
  });
});
