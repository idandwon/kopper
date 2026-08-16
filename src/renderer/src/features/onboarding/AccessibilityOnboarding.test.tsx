import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KopperApi } from "../../../../shared/ipc/contract";
import { AccessibilityOnboarding } from "./AccessibilityOnboarding";

const getAccessibilityPermission =
  vi.fn<KopperApi["getAccessibilityPermission"]>();
const openAccessibilitySettings =
  vi.fn<KopperApi["openAccessibilitySettings"]>();
const continueWithoutCapture = vi.fn<KopperApi["continueWithoutCapture"]>();
const unsubscribe = vi.fn();
let permissionListener:
  | Parameters<KopperApi["onAccessibilityPermissionChanged"]>[0]
  | undefined;

beforeEach(() => {
  getAccessibilityPermission.mockReset().mockResolvedValue({
    ok: true,
    value: "unknown",
  });
  openAccessibilitySettings.mockReset().mockResolvedValue({
    ok: true,
    value: { acknowledged: true },
  });
  continueWithoutCapture.mockReset().mockResolvedValue({
    ok: true,
    value: { acknowledged: true },
  });
  unsubscribe.mockReset();
  permissionListener = undefined;
  window.kopper = {
    getAccessibilityPermission,
    openAccessibilitySettings,
    continueWithoutCapture,
    onAccessibilityPermissionChanged: vi.fn((listener) => {
      permissionListener = listener;
      return unsubscribe;
    }),
  } as unknown as KopperApi;
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("AccessibilityOnboarding", () => {
  it("uses explicit privacy copy and offers every onboarding action", async () => {
    render(
      <AccessibilityOnboarding
        onGranted={vi.fn()}
        onContinueWithoutCapture={vi.fn()}
      />,
    );

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
    expect(
      screen.getByRole("button", { name: "Enable Capture" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open System Settings" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Check again" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Continue without capture" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(getAccessibilityPermission).toHaveBeenCalledExactlyOnceWith(false),
    );
  });

  it("prompts only from Enable Capture and announces denial", async () => {
    getAccessibilityPermission
      .mockResolvedValueOnce({ ok: true, value: "unknown" })
      .mockResolvedValueOnce({ ok: true, value: "denied" })
      .mockResolvedValueOnce({ ok: true, value: "denied" });
    render(
      <AccessibilityOnboarding
        onGranted={vi.fn()}
        onContinueWithoutCapture={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(getAccessibilityPermission).toHaveBeenCalledWith(false),
    );

    fireEvent.click(screen.getByRole("button", { name: "Enable Capture" }));
    await waitFor(() =>
      expect(getAccessibilityPermission).toHaveBeenLastCalledWith(true),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Accessibility access is not enabled.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() =>
      expect(getAccessibilityPermission).toHaveBeenLastCalledWith(false),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Open System Settings" }),
    );
    await waitFor(() =>
      expect(openAccessibilitySettings).toHaveBeenCalledOnce(),
    );
  });

  it("settles an in-flight action when a permission event arrives first", async () => {
    let resolvePrompt: ((value: Awaited<ReturnType<KopperApi["getAccessibilityPermission"]>>) => void) | undefined;
    getAccessibilityPermission
      .mockResolvedValueOnce({ ok: true, value: "unknown" })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePrompt = resolve;
        }),
      );
    render(
      <AccessibilityOnboarding
        onGranted={vi.fn()}
        onContinueWithoutCapture={vi.fn()}
      />,
    );
    await waitFor(() => expect(getAccessibilityPermission).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Enable Capture" }));
    expect(screen.getByRole("button", { name: "Enable Capture" })).toBeDisabled();

    act(() => permissionListener?.("denied"));
    expect(screen.getByRole("button", { name: "Enable Capture" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Accessibility access is not enabled.",
    );
    await act(async () => {
      resolvePrompt?.({ ok: true, value: "denied" });
      await Promise.resolve();
    });
  });

  it("polls passively every 750 ms only while visible and stops on grant", async () => {
    vi.useFakeTimers();
    const onGranted = vi.fn();
    getAccessibilityPermission
      .mockResolvedValueOnce({ ok: true, value: "unknown" })
      .mockResolvedValueOnce({ ok: true, value: "granted" });
    render(
      <AccessibilityOnboarding
        onGranted={onGranted}
        onContinueWithoutCapture={vi.fn()}
      />,
    );
    await act(async () => Promise.resolve());
    expect(getAccessibilityPermission).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(749);
    });
    expect(getAccessibilityPermission).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(getAccessibilityPermission).toHaveBeenNthCalledWith(2, false);
    expect(onGranted).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_250);
    });
    expect(getAccessibilityPermission).toHaveBeenCalledTimes(2);
  });

  it("dismisses only after main acknowledges the session intent", async () => {
    const onContinue = vi.fn();
    continueWithoutCapture
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "write_failed",
          message: "Kopper could not continue without capture.",
          retryable: true,
        },
      })
      .mockResolvedValueOnce({ ok: true, value: { acknowledged: true } });
    render(
      <AccessibilityOnboarding
        onGranted={vi.fn()}
        onContinueWithoutCapture={onContinue}
      />,
    );
    await waitFor(() => expect(getAccessibilityPermission).toHaveBeenCalled());

    fireEvent.click(
      screen.getByRole("button", { name: "Continue without capture" }),
    );
    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
    expect(onContinue).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Continue without capture" }),
    );
    await waitFor(() => expect(onContinue).toHaveBeenCalledOnce());
    expect(continueWithoutCapture).toHaveBeenCalledTimes(2);
  });

  it("responds to validated permission events and unsubscribes on unmount", async () => {
    const onGranted = vi.fn();
    const view = render(
      <AccessibilityOnboarding
        onGranted={onGranted}
        onContinueWithoutCapture={vi.fn()}
      />,
    );
    await waitFor(() => expect(permissionListener).toBeDefined());

    act(() => permissionListener?.("granted"));
    expect(onGranted).toHaveBeenCalledOnce();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("remains responsive through StrictMode effect replay", async () => {
    const onGranted = vi.fn();
    render(
      <StrictMode>
        <AccessibilityOnboarding
          onGranted={onGranted}
          onContinueWithoutCapture={vi.fn()}
        />
      </StrictMode>,
    );
    await waitFor(() => expect(permissionListener).toBeDefined());

    act(() => permissionListener?.("granted"));
    expect(onGranted).toHaveBeenCalledOnce();
  });

  it("does not update or poll after unmount", async () => {
    vi.useFakeTimers();
    let resolveCheck:
      | ((
          value: Awaited<ReturnType<KopperApi["getAccessibilityPermission"]>>,
        ) => void)
      | undefined;
    getAccessibilityPermission.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCheck = resolve;
      }),
    );
    const onGranted = vi.fn();
    const view = render(
      <AccessibilityOnboarding
        onGranted={onGranted}
        onContinueWithoutCapture={vi.fn()}
      />,
    );
    view.unmount();

    await act(async () => {
      resolveCheck?.({ ok: true, value: "granted" });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(onGranted).not.toHaveBeenCalled();
    expect(getAccessibilityPermission).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
