import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  installApi();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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
