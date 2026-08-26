import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AccessibilityOnboarding,
  type AccessibilityOnboardingProps,
} from "./AccessibilityOnboarding";

const checkPermission = vi.fn<AccessibilityOnboardingProps["checkPermission"]>();
const openSettings = vi.fn<AccessibilityOnboardingProps["openSettings"]>();
const continueWithoutCapture =
  vi.fn<AccessibilityOnboardingProps["continueWithoutCapture"]>();

function onboarding(
  overrides: Partial<AccessibilityOnboardingProps> = {},
) {
  return (
    <AccessibilityOnboarding
      permission="unknown"
      operationError={null}
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
    expect(
      screen.queryByText("Lifecycle: captured to completed"),
    ).not.toBeInTheDocument();
    expect(
      globalThis.document.querySelector("[data-panel-drag-region]"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "Hide Kopper" })).toBeVisible();
  });

  it("stacks narrow secondary actions outside one onboarding scroll owner", () => {
    const { container } = render(onboarding());

    const owners = container.querySelectorAll(
      '[data-scroll-owner="onboarding"]',
    );
    expect(owners).toHaveLength(1);
    const owner = owners[0];
    const secondaryActions = container.querySelector(
      "[data-onboarding-secondary-actions]",
    );
    expect(secondaryActions).toHaveClass("grid-cols-1");
    expect(secondaryActions).toHaveClass("min-[380px]:grid-cols-2");
    expect(owner).not.toContainElement(
      screen.getByRole("button", { name: "Continue without capture" }),
    );
  });

  it("uses prompt only for Enable Capture and announces denial", async () => {
    const view = render(onboarding({ permission: "denied" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Accessibility access is not enabled.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "If Kopper already appears enabled, remove it with the minus button, add the current Kopper app again, then check again.",
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

  it("performs no background polling or visibility-triggered checks", async () => {
    vi.useFakeTimers();
    const intervalSpy = vi.spyOn(window, "setInterval");
    render(onboarding());

    fireEvent(document, new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(10_000);

    expect(intervalSpy).not.toHaveBeenCalled();
    expect(checkPermission).not.toHaveBeenCalled();
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
