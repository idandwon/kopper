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
  it("controls a configurable capture binding from permission and store health", async () => {
    const check = vi.fn(() => "granted" as const);
    const binding = {
      setCaptureEnabled: vi.fn(async () => ({
        ok: true as const,
        value: undefined,
      })),
    };
    const runtime = new CaptureRuntime({ check }, binding, vi.fn());

    await runtime.start(true);
    expect(binding.setCaptureEnabled).toHaveBeenCalledWith(true);
    expect(runtime.isCaptureAvailable()).toBe(true);
    await runtime.setRepositoryHealthy(false);
    expect(binding.setCaptureEnabled).toHaveBeenLastCalledWith(false);
    expect(runtime.isCaptureAvailable()).toBe(false);
  });

  it("retries a persisted binding after a fixed shortcut conflict", async () => {
    const binding = {
      setCaptureEnabled: vi
        .fn()
        .mockResolvedValueOnce({
          ok: false as const,
          error: {
            code: "shortcut_conflict" as const,
            message: "conflict",
            retryable: false,
          },
        })
        .mockResolvedValueOnce({ ok: true as const, value: undefined }),
    };
    const runtime = new CaptureRuntime(
      { check: () => "granted" },
      binding,
      vi.fn(),
    );
    await runtime.start(true);
    expect(runtime.isCaptureAvailable()).toBe(false);

    await runtime.retryCaptureBinding();

    expect(binding.setCaptureEnabled).toHaveBeenCalledTimes(2);
    expect(runtime.isCaptureAvailable()).toBe(true);
  });

  it("performs one passive startup check and creates the monitor only after granted", async () => {
    const { runtime, check, factory, created } = setup({
      check: () => "granted",
    });
    await runtime.start(true);

    expect(check).toHaveBeenCalledExactlyOnceWith(false);
    expect(factory).toHaveBeenCalledOnce();
    expect(created.start).toHaveBeenCalledOnce();
    await runtime.start(true);
    expect(check).toHaveBeenCalledOnce();
  });

  it("does not check permission or create a monitor until a failed repository load recovers", async () => {
    const { runtime, check, factory, created } = setup({
      check: () => "granted",
    });

    await runtime.start(false);
    await runtime.onPermissionObserved("granted");
    expect(check).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();

    await runtime.setRepositoryHealthy(true);

    expect(check).toHaveBeenCalledExactlyOnceWith(false);
    expect(factory).toHaveBeenCalledOnce();
    expect(created.start).toHaveBeenCalledOnce();
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

  it("stops and restarts for a running denied-to-granted burst", async () => {
    const first = monitor();
    const second = monitor();
    const factory = vi
      .fn<() => Promise<CaptureMonitor>>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { runtime } = setup({ factory });
    await runtime.onPermissionObserved("granted");

    const denied = runtime.onPermissionObserved("denied");
    const granted = runtime.onPermissionObserved("granted");
    await Promise.all([denied, granted]);

    expect(first.stop).toHaveBeenCalledOnce();
    expect(second.start).toHaveBeenCalledOnce();
  });

  it("stops immediately and prevents in-flight start after repository health is lost", async () => {
    const pending = deferred<CaptureMonitor>();
    const stale = monitor();
    const { runtime, factory } = setup({ factory: () => pending.promise });
    const granting = runtime.onPermissionObserved("granted");
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());

    await runtime.setRepositoryHealthy(false);

    pending.resolve(stale);
    await granting;

    expect(stale.start).not.toHaveBeenCalled();
    expect(stale.stop).toHaveBeenCalledOnce();
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

  it("does not start after a queued grant when dispose happens first", async () => {
    const created = monitor();
    const { runtime, factory } = setup({ factory: async () => created });

    const denied = runtime.onPermissionObserved("denied");
    const granted = runtime.onPermissionObserved("granted");
    runtime.dispose();
    await Promise.all([denied, granted]);

    expect(factory).not.toHaveBeenCalled();
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
