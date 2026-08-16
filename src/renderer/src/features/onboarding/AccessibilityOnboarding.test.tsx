import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AccessibilityOnboarding,
  type AccessibilityOnboardingProps,
} from "./AccessibilityOnboarding";

const checkPermission = vi.fn<AccessibilityOnboardingProps["checkPermission"]>();
const openSettings = vi.fn<AccessibilityOnboardingProps["openSettings"]>();
const continueWithoutCapture =
  vi.fn<AccessibilityOnboardingProps["continueWithoutCapture"]>();

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
  fireEvent(document, new Event("visibilitychange"));
}

function onboarding(
  overrides: Partial<AccessibilityOnboardingProps> = {},
) {
  return (
    <AccessibilityOnboarding
      permission="unknown"
      operationError={null}
      initialCheckComplete
      permissionEventVersion={0}
      checkPermission={checkPermission}
      openSettings={openSettings}
      continueWithoutCapture={continueWithoutCapture}
      {...overrides}
    />
  );
}

beforeEach(() => {
  checkPermission.mockReset().mockResolvedValue(undefined);
  openSettings.mockReset().mockResolvedValue(undefined);
  continueWithoutCapture.mockReset().mockResolvedValue(true);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AccessibilityOnboarding", () => {
  it("uses explicit privacy copy and offers every onboarding action", () => {
    render(onboarding());

    expect(
      screen.getByText(
        "Kopper needs Accessibility access to notice its shortcuts and copy text you explicitly capture.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Kopper reads a selection only after you use your configured capture shortcut.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Enable Capture" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open System Settings" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Check again" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Continue without capture" }),
    ).toBeVisible();
  });

  it("uses prompt only for Enable Capture and announces denial", async () => {
    const view = render(onboarding({ permission: "denied" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Accessibility access is not enabled.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Enable Capture" }));
    await waitFor(() => expect(checkPermission).toHaveBeenCalledWith(true));
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(checkPermission).toHaveBeenLastCalledWith(false));
    fireEvent.click(
      screen.getByRole("button", { name: "Open System Settings" }),
    );
    await waitFor(() => expect(openSettings).toHaveBeenCalledOnce());
    view.rerender(onboarding({ permission: "restricted" }));
    expect(screen.getByRole("button", { name: "Enable Capture" })).toBeDisabled();
  });

  it("does not check while hidden and resumes with one immediate passive check before polling", async () => {
    vi.useFakeTimers();
    const intervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const view = render(onboarding());
    expect(intervalSpy).toHaveBeenCalledOnce();
    expect(intervalSpy.mock.calls.length - clearIntervalSpy.mock.calls.length).toBe(1);

    act(() => setVisibility("hidden"));
    expect(intervalSpy.mock.calls.length - clearIntervalSpy.mock.calls.length).toBe(0);
    await act(async () => vi.advanceTimersByTimeAsync(2_250));
    expect(checkPermission).not.toHaveBeenCalled();

    await act(async () => {
      setVisibility("visible");
      await Promise.resolve();
    });
    expect(checkPermission).toHaveBeenCalledExactlyOnceWith(false);
    expect(intervalSpy.mock.calls.length - clearIntervalSpy.mock.calls.length).toBe(1);

    await act(async () => vi.advanceTimersByTimeAsync(750));
    expect(checkPermission).toHaveBeenCalledTimes(2);
    expect(checkPermission).toHaveBeenLastCalledWith(false);

    view.rerender(onboarding({ permission: "granted" }));
    expect(intervalSpy.mock.calls.length - clearIntervalSpy.mock.calls.length).toBe(0);
  });

  it("keeps exactly one poll timer through StrictMode replay and clears it on unmount", () => {
    vi.useFakeTimers();
    const intervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const view = render(<StrictMode>{onboarding()}</StrictMode>);
    expect(intervalSpy.mock.calls.length - clearIntervalSpy.mock.calls.length).toBe(1);
    view.unmount();
    expect(intervalSpy.mock.calls.length - clearIntervalSpy.mock.calls.length).toBe(0);
  });

  it("stops polling after continue is acknowledged", async () => {
    vi.useFakeTimers();
    const intervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    render(onboarding());
    expect(intervalSpy.mock.calls.length - clearIntervalSpy.mock.calls.length).toBe(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Continue without capture" }),
    );
    await act(async () => Promise.resolve());
    expect(continueWithoutCapture).toHaveBeenCalledOnce();
    expect(intervalSpy.mock.calls.length - clearIntervalSpy.mock.calls.length).toBe(0);
  });

  it("renders fixed operation errors supplied by the gate", () => {
    render(
      onboarding({
        operationError: "Kopper could not check Accessibility access.",
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Kopper could not check Accessibility access.",
    );
  });
});
