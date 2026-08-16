import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KopperApi } from "../../../../shared/ipc/contract";
import {
  AccessibilityPermissionGate,
  type AccessibilityPermissionPanelControls,
} from "./AccessibilityPermissionGate";

const getAccessibilityPermission =
  vi.fn<KopperApi["getAccessibilityPermission"]>();
const getAccessibilitySession = vi.fn<KopperApi["getAccessibilitySession"]>();
const openAccessibilitySettings =
  vi.fn<KopperApi["openAccessibilitySettings"]>();
const continueWithoutCapture = vi.fn<KopperApi["continueWithoutCapture"]>();
const unsubscribe = vi.fn();
let permissionListener:
  | Parameters<KopperApi["onAccessibilityPermissionChanged"]>[0]
  | undefined;
let visibilityState: DocumentVisibilityState;

function installApi() {
  window.kopper = {
    getAccessibilityPermission,
    getAccessibilitySession,
    openAccessibilitySettings,
    continueWithoutCapture,
    onAccessibilityPermissionChanged: vi.fn((listener) => {
      permissionListener = listener;
      return unsubscribe;
    }),
  } as unknown as KopperApi;
}

beforeEach(() => {
  getAccessibilityPermission.mockReset().mockResolvedValue({
    ok: true,
    value: "unknown",
  });
  getAccessibilitySession.mockReset().mockResolvedValue({
    ok: true,
    value: { continuedWithoutCapture: false },
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
  visibilityState = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => visibilityState,
  );
  installApi();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderGate() {
  return render(
    <AccessibilityPermissionGate
      renderPanel={(
        captureUnavailable: boolean,
        controls: AccessibilityPermissionPanelControls,
      ) => (
        <div>
          <h1>Normal panel</h1>
          {captureUnavailable && (
            <div>
              <p role="status">Capture unavailable: {controls.permission}</p>
              <button
                type="button"
                disabled={controls.pendingAction !== null}
                onClick={() => void controls.openSettings()}
              >
                Open continued settings
              </button>
              <button
                type="button"
                disabled={controls.pendingAction !== null}
                onClick={() => void controls.checkAccess()}
              >
                Check continued access
              </button>
            </div>
          )}
        </div>
      )}
    />,
  );
}

describe("AccessibilityPermissionGate", () => {
  it("loads passive permission and main-owned session disposition once", async () => {
    renderGate();

    expect(
      await screen.findByRole("heading", { name: "Enable explicit text capture" }),
    ).toBeVisible();
    expect(getAccessibilityPermission).toHaveBeenCalledExactlyOnceWith(false);
    expect(getAccessibilitySession).toHaveBeenCalledOnce();
    expect(window.kopper.onAccessibilityPermissionChanged).toHaveBeenCalledOnce();
  });

  it("passively polls every 750 ms only while visible onboarding is incomplete", async () => {
    vi.useFakeTimers();
    const view = renderGate();
    await act(async () => undefined);

    expect(screen.getByRole("heading", { name: "Enable explicit text capture" })).toBeVisible();
    expect(getAccessibilityPermission).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTime(749));
    expect(getAccessibilityPermission).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(1));
    expect(getAccessibilityPermission).toHaveBeenCalledTimes(2);

    visibilityState = "hidden";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => vi.advanceTimersByTime(1_500));
    expect(getAccessibilityPermission).toHaveBeenCalledTimes(2);

    visibilityState = "visible";
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(getAccessibilityPermission).toHaveBeenCalledTimes(3);
    await act(async () => vi.advanceTimersByTime(750));
    expect(getAccessibilityPermission).toHaveBeenCalledTimes(4);

    view.unmount();
    await act(async () => vi.advanceTimersByTime(1_500));
    expect(getAccessibilityPermission).toHaveBeenCalledTimes(4);
    expect(getAccessibilityPermission.mock.calls.every(([prompt]) => !prompt)).toBe(true);
  });

  it("does not check while initially hidden and checks immediately on visibility return", async () => {
    vi.useFakeTimers();
    visibilityState = "hidden";
    renderGate();
    await act(async () => undefined);

    await act(async () => vi.advanceTimersByTime(1_500));
    expect(getAccessibilityPermission).not.toHaveBeenCalled();

    visibilityState = "visible";
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(getAccessibilityPermission).toHaveBeenCalledExactlyOnceWith(false);
    expect(screen.getByRole("heading", { name: "Enable explicit text capture" })).toBeVisible();
  });

  it("invalidates a pre-hide passive result and checks fresh on visibility return", async () => {
    vi.useFakeTimers();
    let resolveDelayed:
      | ((result: { ok: true; value: "granted" }) => void)
      | undefined;
    getAccessibilityPermission
      .mockResolvedValueOnce({ ok: true, value: "unknown" })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveDelayed = resolve;
        }),
      )
      .mockResolvedValueOnce({ ok: true, value: "unknown" });
    renderGate();
    await act(async () => undefined);

    await act(async () => vi.advanceTimersByTime(750));
    expect(getAccessibilityPermission).toHaveBeenCalledTimes(2);

    visibilityState = "hidden";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    visibilityState = "visible";
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(getAccessibilityPermission).toHaveBeenCalledTimes(3);
    expect(getAccessibilityPermission).toHaveBeenLastCalledWith(false);

    await act(async () => resolveDelayed?.({ ok: true, value: "granted" }));
    expect(
      screen.getByRole("heading", { name: "Enable explicit text capture" }),
    ).toBeVisible();

    await act(async () => vi.advanceTimersByTime(750));
    expect(getAccessibilityPermission).toHaveBeenCalledTimes(4);
  });

  it("keeps exactly one passive interval in StrictMode and stops it on grant", async () => {
    vi.useFakeTimers();
    render(
      <StrictMode>
        <AccessibilityPermissionGate renderPanel={() => <h1>Normal panel</h1>} />
      </StrictMode>,
    );
    await act(async () => undefined);
    getAccessibilityPermission.mockClear();

    await act(async () => vi.advanceTimersByTime(750));
    expect(getAccessibilityPermission).toHaveBeenCalledExactlyOnceWith(false);

    act(() => permissionListener?.("granted"));
    expect(screen.getByRole("heading", { name: "Normal panel" })).toBeVisible();
    await act(async () => vi.advanceTimersByTime(1_500));
    expect(getAccessibilityPermission).toHaveBeenCalledTimes(1);
  });

  it("stops passive polling after Continue is acknowledged", async () => {
    vi.useFakeTimers();
    renderGate();
    await act(async () => undefined);

    await act(async () => {
      screen
        .getByRole("button", { name: "Continue without capture" })
        .click();
    });
    expect(screen.getByRole("heading", { name: "Normal panel" })).toBeVisible();

    await act(async () => vi.advanceTimersByTime(1_500));
    expect(getAccessibilityPermission).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("honors a consumed main dismissal on renderer remount and stays truthful through events", async () => {
    let continued = false;
    getAccessibilitySession.mockImplementation(async () => ({
      ok: true,
      value: { continuedWithoutCapture: continued },
    }));
    continueWithoutCapture.mockImplementation(async () => {
      continued = true;
      return { ok: true, value: { acknowledged: true } };
    });
    const user = userEvent.setup();
    const first = renderGate();
    await screen.findByRole("heading", { name: "Enable explicit text capture" });

    await user.click(
      screen.getByRole("button", { name: "Continue without capture" }),
    );
    expect(await screen.findByRole("heading", { name: "Normal panel" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Capture unavailable");

    act(() => permissionListener?.("granted"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => permissionListener?.("denied"));
    expect(screen.getByRole("status")).toHaveTextContent("Capture unavailable");

    first.unmount();
    renderGate();
    expect(await screen.findByRole("heading", { name: "Normal panel" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Capture unavailable");
  });

  it("checks access from the continued panel and clears unavailable after a later grant", async () => {
    getAccessibilitySession.mockResolvedValue({
      ok: true,
      value: { continuedWithoutCapture: true },
    });
    getAccessibilityPermission
      .mockResolvedValueOnce({ ok: true, value: "unknown" })
      .mockResolvedValueOnce({ ok: true, value: "denied" });
    const user = userEvent.setup();
    renderGate();

    expect(await screen.findByRole("heading", { name: "Normal panel" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Check continued access" }));
    expect(screen.getByRole("status")).toHaveTextContent("denied");
    expect(getAccessibilityPermission).toHaveBeenLastCalledWith(false);

    act(() => permissionListener?.("granted"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("settles a continued-panel check when a permission event arrives first", async () => {
    getAccessibilitySession.mockResolvedValue({
      ok: true,
      value: { continuedWithoutCapture: true },
    });
    getAccessibilityPermission
      .mockResolvedValueOnce({ ok: true, value: "unknown" })
      .mockReturnValueOnce(new Promise(() => undefined));
    const user = userEvent.setup();
    renderGate();
    expect(await screen.findByRole("heading", { name: "Normal panel" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Check continued access" }));
    expect(screen.getByRole("button", { name: "Check continued access" })).toBeDisabled();
    act(() => permissionListener?.("denied"));
    expect(screen.getByRole("button", { name: "Check continued access" })).toBeEnabled();
  });

  it("settles continued-panel settings failures and restores its controls", async () => {
    getAccessibilitySession.mockResolvedValue({
      ok: true,
      value: { continuedWithoutCapture: true },
    });
    openAccessibilitySettings.mockRejectedValueOnce(new Error("private detail"));
    const user = userEvent.setup();
    renderGate();
    expect(await screen.findByRole("heading", { name: "Normal panel" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Open continued settings" }));

    expect(screen.getByRole("button", { name: "Open continued settings" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Capture unavailable");
  });

  it("settles an interactive check when a permission event arrives first", async () => {
    getAccessibilityPermission
      .mockResolvedValueOnce({ ok: true, value: "unknown" })
      .mockReturnValueOnce(new Promise(() => undefined));
    const user = userEvent.setup();
    renderGate();
    await screen.findByRole("heading", { name: "Enable explicit text capture" });

    await user.click(screen.getByRole("button", { name: "Enable Capture" }));
    expect(getAccessibilityPermission).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: "Enable Capture" })).toBeDisabled();
    act(() => permissionListener?.("denied"));
    expect(screen.getByRole("button", { name: "Enable Capture" })).toBeEnabled();
  });

  it("maps rejected checks to fixed copy and clears the stale error after recovery", async () => {
    getAccessibilityPermission
      .mockRejectedValueOnce(new Error("secret transport detail"))
      .mockResolvedValueOnce({ ok: true, value: "unknown" });
    const user = userEvent.setup();
    renderGate();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Kopper could not check Accessibility access.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("secret");
    await user.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled();
  });

  it("settles rejected settings and continue actions and recovers", async () => {
    openAccessibilitySettings
      .mockRejectedValueOnce(new Error("private settings detail"))
      .mockResolvedValueOnce({ ok: true, value: { acknowledged: true } });
    continueWithoutCapture
      .mockRejectedValueOnce(new Error("private continue detail"))
      .mockResolvedValueOnce({ ok: true, value: { acknowledged: true } });
    const user = userEvent.setup();
    renderGate();
    await screen.findByRole("heading", { name: "Enable explicit text capture" });

    await user.click(screen.getByRole("button", { name: "Open System Settings" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Kopper could not open Accessibility settings.",
    );
    expect(screen.getByRole("button", { name: "Open System Settings" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Open System Settings" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Continue without capture" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Kopper could not continue without capture.",
    );
    expect(screen.getByRole("button", { name: "Continue without capture" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Continue without capture" }));
    expect(await screen.findByRole("heading", { name: "Normal panel" })).toBeVisible();
  });
});
