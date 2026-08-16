import { describe, expect, it, vi } from "vitest";

import type { PermissionState } from "../../shared/permissions/permissionState";
import { CaptureRuntime } from "../capture/captureRuntime";
import { PermissionObserver } from "./permissionObserver";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("PermissionObserver", () => {
  it("awaits runtime reconciliation before returning or publishing a transition", async () => {
    const gate = deferred();
    const order: string[] = [];
    const check = vi
      .fn<(prompt: boolean) => PermissionState>()
      .mockReturnValueOnce("denied")
      .mockReturnValueOnce("granted");
    const reconcile = vi.fn(async (state: PermissionState) => {
      order.push(`reconcile:${state}:start`);
      if (state === "granted") await gate.promise;
      order.push(`reconcile:${state}:end`);
    });
    const publish = vi.fn((state: PermissionState) => {
      order.push(`publish:${state}`);
    });
    const observer = new PermissionObserver({ check }, reconcile, publish);

    await expect(observer.observe(false)).resolves.toBe("denied");
    expect(publish).not.toHaveBeenCalled();

    let settled = false;
    const observing = observer.observe(true).then((state: PermissionState) => {
      settled = true;
      order.push(`result:${state}`);
      return state;
    });
    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledTimes(2));
    expect(settled).toBe(false);
    expect(publish).not.toHaveBeenCalled();

    gate.resolve();
    await expect(observing).resolves.toBe("granted");
    expect(order).toEqual([
      "reconcile:denied:start",
      "reconcile:denied:end",
      "reconcile:granted:start",
      "reconcile:granted:end",
      "publish:granted",
      "result:granted",
    ]);
  });

  it("seeds the first successful observation, publishes changes only, and isolates publication failures", async () => {
    const check = vi
      .fn<(prompt: boolean) => PermissionState>()
      .mockReturnValueOnce("unknown")
      .mockReturnValueOnce("unknown")
      .mockReturnValueOnce("denied")
      .mockReturnValueOnce("granted");
    const reconcile = vi.fn(async () => undefined);
    const publish = vi
      .fn<(state: PermissionState) => void>()
      .mockImplementationOnce(() => {
        throw new Error("renderer disappeared");
      });
    const observer = new PermissionObserver({ check }, reconcile, publish);

    await expect(observer.observe(false)).resolves.toBe("unknown");
    await expect(observer.observe(false)).resolves.toBe("unknown");
    await expect(observer.observe(true)).resolves.toBe("denied");
    await expect(observer.observe(false)).resolves.toBe("granted");

    expect(check.mock.calls).toEqual([[false], [false], [true], [false]]);
    expect(reconcile.mock.calls).toEqual([
      ["unknown"],
      ["unknown"],
      ["denied"],
      ["granted"],
    ]);
    expect(publish.mock.calls).toEqual([["denied"], ["granted"]]);
  });

  it("reconciles a later grant and live revoke with CaptureRuntime before each public event", async () => {
    let state: PermissionState = "denied";
    const permission = { check: vi.fn(() => state) };
    const binding = {
      setCaptureEnabled: vi.fn(async (_enabled: boolean) => ({
        ok: true as const,
        value: undefined,
      })),
    };
    const runtime = new CaptureRuntime(permission, binding, vi.fn());
    await runtime.start();
    const publishedAvailability: Array<[PermissionState, boolean]> = [];
    const observer = new PermissionObserver(
      permission,
      (observed) => runtime.onPermissionObserved(observed),
      (observed) => {
        publishedAvailability.push([observed, runtime.isCaptureAvailable()]);
      },
    );

    await observer.observe(false);
    state = "granted";
    await observer.observe(false);
    state = "denied";
    await observer.observe(false);

    expect(binding.setCaptureEnabled.mock.calls.map(([enabled]) => enabled)).toEqual([
      false,
      false,
      true,
      false,
    ]);
    expect(publishedAvailability).toEqual([
      ["granted", true],
      ["denied", false],
    ]);
    expect(runtime.isCaptureAvailable()).toBe(false);
  });

  it("does not seed or publish when checking or reconciliation fails", async () => {
    const check = vi
      .fn<(prompt: boolean) => PermissionState>()
      .mockImplementationOnce(() => {
        throw new Error("private adapter error");
      })
      .mockReturnValue("granted");
    const reconcile = vi
      .fn<(state: PermissionState) => Promise<void>>()
      .mockRejectedValueOnce(new Error("binding failed"))
      .mockResolvedValue(undefined);
    const publish = vi.fn();
    const observer = new PermissionObserver({ check }, reconcile, publish);

    await expect(observer.observe(false)).rejects.toThrow();
    await expect(observer.observe(false)).rejects.toThrow();
    await expect(observer.observe(false)).resolves.toBe("granted");
    expect(publish).not.toHaveBeenCalled();
  });
});
