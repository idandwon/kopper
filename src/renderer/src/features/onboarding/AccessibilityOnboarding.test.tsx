import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AccessibilityOnboarding,
  type AccessibilityOnboardingProps,
} from "./AccessibilityOnboarding";

const repairAccess = vi.fn<AccessibilityOnboardingProps["repairAccess"]>();
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
      repairAccess={repairAccess}
      openSettings={openSettings}
      continueWithoutCapture={continueWithoutCapture}
      {...overrides}
    />
  );
}

beforeEach(() => {
  repairAccess.mockReset().mockResolvedValue(undefined);
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
    expect(screen.getByRole("button", { name: "Repair access" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open System Settings" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Check again" })).not.toBeInTheDocument();
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
    expect(secondaryActions).not.toHaveClass("min-[380px]:grid-cols-2");
    expect(owner).not.toContainElement(
      screen.getByRole("button", { name: "Continue without capture" }),
    );
  });

  it("uses the repair flow for an ungranted build and announces concise guidance", async () => {
    const view = render(onboarding({ permission: "denied" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "macOS must approve this Kopper build.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Repair access, then enable Kopper in System Settings.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Repair access" }));
    await waitFor(() => expect(repairAccess).toHaveBeenCalledOnce());
    fireEvent.click(
      screen.getByRole("button", { name: "Open System Settings" }),
    );
    await waitFor(() => expect(openSettings).toHaveBeenCalledOnce());
    view.rerender(onboarding({ permission: "restricted" }));
    expect(screen.getByRole("button", { name: "Repair access" })).toBeDisabled();
  });

  it("performs no background polling or visibility-triggered checks", async () => {
    vi.useFakeTimers();
    const intervalSpy = vi.spyOn(window, "setInterval");
    render(onboarding());

    fireEvent(document, new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(10_000);

    expect(intervalSpy).not.toHaveBeenCalled();
    expect(repairAccess).not.toHaveBeenCalled();
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
