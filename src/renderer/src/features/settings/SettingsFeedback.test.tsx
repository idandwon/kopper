import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SettingsFeedback,
  type SettingsFeedbackValue,
} from "./SettingsFeedback";

function FeedbackHarness({
  initial,
  persistent = false,
  revision = 0,
}: {
  initial: SettingsFeedbackValue;
  persistent?: boolean;
  revision?: number;
}) {
  const [value, setValue] = useState<SettingsFeedbackValue | null>(initial);
  return (
    <div data-revision={revision}>
      <SettingsFeedback
        value={value}
        persistent={persistent}
        onDismiss={() => setValue(null)}
      />
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SettingsFeedback", () => {
  it("automatically clears temporary status feedback", () => {
    vi.useFakeTimers();
    render(
      <FeedbackHarness initial={{ text: "Theme activated.", tone: "status" }} />,
    );

    act(() => vi.advanceTimersByTime(1_799));
    expect(screen.getByRole("status")).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps an error readable for four seconds and supports immediate dismissal", () => {
    vi.useFakeTimers();
    render(
      <FeedbackHarness
        initial={{ text: "Theme activation failed.", tone: "error" }}
      />,
    );

    act(() => vi.advanceTimersByTime(3_999));
    expect(screen.getByRole("alert")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss message" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps blocking feedback until it is dismissed", () => {
    vi.useFakeTimers();
    render(
      <FeedbackHarness
        initial={{ text: "Resolve this conflict.", tone: "error" }}
        persistent
      />,
    );

    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("alert")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss message" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not postpone dismissal when its parent rerenders", () => {
    vi.useFakeTimers();
    const view = render(
      <FeedbackHarness
        initial={{ text: "Theme activated.", tone: "status" }}
        revision={0}
      />,
    );

    act(() => vi.advanceTimersByTime(1_000));
    view.rerender(
      <FeedbackHarness
        initial={{ text: "Theme activated.", tone: "status" }}
        revision={1}
      />,
    );
    act(() => vi.advanceTimersByTime(800));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
