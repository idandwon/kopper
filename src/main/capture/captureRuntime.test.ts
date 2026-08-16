import { describe, expect, it, vi } from "vitest";

import type { PermissionState } from "../../shared/permissions/permissionState";
import type { CaptureOutcome } from "../../shared/ipc/contract";
import { CaptureRuntime, type CaptureMonitor } from "./captureRuntime";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function monitor(startResult: ReturnType<CaptureMonitor["start"]> = { ok: true, value: undefined }) {
  return {
    start: vi.fn(() => startResult),
    stop: vi.fn(),
  } satisfies CaptureMonitor;
}

function setup(options: {
  check?: () => PermissionState;
  factory?: () => Promise<CaptureMonitor>;
} = {}) {
  const created = monitor();
  const check = vi.fn(options.check ?? (() => "unknown" as const));
  const factory = vi.fn(options.factory ?? (async () => created));
  const publish = vi.fn<(outcome: CaptureOutcome) => void>();
  const runtime = new CaptureRuntime({ check }, factory, publish);
  return { runtime, check, factory, publish, created };
}

describe("CaptureRuntime", () => {
  it("performs one passive startup check and creates the monitor only after granted", async () => {
    const { runtime, check, factory, created } = setup({ check: () => "granted" });
    await runtime.start();
    expect(check).toHaveBeenCalledExactlyOnceWith(false);
    expect(factory).toHaveBeenCalledOnce();
    expect(created.start).toHaveBeenCalledOnce();
    await runtime.start();
    expect(check).toHaveBeenCalledOnce();
  });

  it("stays disabled when startup check rejects and waits for explicit observation", async () => {
    const { runtime, factory, publish } = setup({ check: () => { throw new Error("native secret"); } });
    await runtime.start();
    expect(factory).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    await runtime.onPermissionObserved("granted");
    expect(factory).toHaveBeenCalledOnce();
  });

  it("coalesces simultaneous same-state grants into one factory and start", async () => {
    const pending = deferred<CaptureMonitor>();
    const created = monitor();
    const factory = vi.fn(() => pending.promise);
    const { runtime } = setup({ factory });
    const first = runtime.onPermissionObserved("granted");
    const second = runtime.onPermissionObserved("granted");
    pending.resolve(created);
    await Promise.all([first, second]);
    expect(factory).toHaveBeenCalledOnce();
    expect(created.start).toHaveBeenCalledOnce();
  });

  it("supersedes an in-flight grant on revoke and starts only for a later grant", async () => {
    const pending = deferred<CaptureMonitor>();
    const stale = monitor();
    const current = monitor();
    const factory = vi.fn<() => Promise<CaptureMonitor>>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(current);
    const { runtime } = setup({ factory });

    const granting = runtime.onPermissionObserved("granted");
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    const revoking = runtime.onPermissionObserved("denied");
    pending.resolve(stale);
    await Promise.all([granting, revoking]);
    expect(stale.start).not.toHaveBeenCalled();
    expect(current.start).not.toHaveBeenCalled();

    await runtime.onPermissionObserved("granted");
    expect(current.start).toHaveBeenCalledOnce();
    await runtime.onPermissionObserved("granted");
    expect(current.start).toHaveBeenCalledOnce();
    await runtime.onPermissionObserved("restricted");
    expect(current.stop).toHaveBeenCalledOnce();
  });

  it("dispose stops once and prevents start after an async factory resolves", async () => {
    const pending = deferred<CaptureMonitor>();
    const created = monitor();
    const { runtime } = setup({ factory: () => pending.promise });
    const observing = runtime.onPermissionObserved("granted");
    runtime.dispose();
    pending.resolve(created);
    await observing;
    expect(created.start).not.toHaveBeenCalled();
    runtime.dispose();
    await runtime.onPermissionObserved("granted");
    expect(created.start).not.toHaveBeenCalled();
  });

  it("publishes one sanitized failure per granted cycle for factory/start failures", async () => {
    const failedStart = monitor({
      ok: false,
      error: { code: "permission_denied", message: "native detail", retryable: true },
    });
    const factory = vi.fn<() => Promise<CaptureMonitor>>()
      .mockRejectedValueOnce(new Error("private module path"))
      .mockResolvedValueOnce(failedStart);
    const { runtime, publish } = setup({ factory });

    await runtime.onPermissionObserved("granted");
    await runtime.onPermissionObserved("granted");
    expect(factory).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledExactlyOnceWith({
      status: "failed",
      error: {
        code: "permission_denied",
        message: "Kopper could not start global keyboard capture.",
        retryable: true,
        recoveryAction: "open_settings",
      },
    });

    await runtime.onPermissionObserved("denied");
    await runtime.onPermissionObserved("granted");
    expect(factory).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(publish.mock.calls)).not.toMatch(/private|native detail/);
  });
});
