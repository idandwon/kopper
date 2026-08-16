import { describe, expect, it, vi } from "vitest";

import type { ShortcutPreferences } from "../../shared/domain/document";
import type { CaptureMonitor } from "../capture/captureRuntime";
import {
  ShortcutManager,
  type GlobalShortcutPort,
} from "./shortcutManager";

class FakeGlobalShortcut implements GlobalShortcutPort {
  readonly callbacks = new Map<string, () => void>();
  readonly register = vi.fn((accelerator: string, callback: () => void) => {
    if (this.blocked.has(accelerator) || this.callbacks.has(accelerator)) {
      return false;
    }
    this.callbacks.set(accelerator, callback);
    return true;
  });
  readonly unregister = vi.fn((accelerator: string) => {
    this.callbacks.delete(accelerator);
  });
  readonly blocked = new Set<string>();
}

function monitor(startOk = true): CaptureMonitor {
  return {
    start: vi.fn(() =>
      startOk
        ? { ok: true as const, value: undefined }
        : {
            ok: false as const,
            error: {
              code: "permission_denied" as const,
              message: "native detail",
              retryable: true,
            },
          },
    ),
    stop: vi.fn(),
  };
}

const doubleShift: ShortcutPreferences = {
  capture: { kind: "double-modifier", modifier: "shift" },
  togglePanel: "CommandOrControl+Shift+Space",
};
const accelerator: ShortcutPreferences = {
  capture: { kind: "accelerator", accelerator: "CommandOrControl+Shift+C" },
  togglePanel: "CommandOrControl+Shift+Space",
};

function setup(createdMonitor = monitor()) {
  const global = new FakeGlobalShortcut();
  const factory = vi.fn(async () => createdMonitor);
  const onCapture = vi.fn();
  const onTogglePanel = vi.fn();
  const manager = new ShortcutManager(global, factory, {
    onCapture,
    onTogglePanel,
  });
  return { manager, global, factory, createdMonitor, onCapture, onTogglePanel };
}

describe("ShortcutManager", () => {
  it("keeps toggle active independently and lazily starts Double Shift only when capture is enabled", async () => {
    const { manager, global, factory, createdMonitor, onTogglePanel } = setup();
    await expect(manager.apply(doubleShift)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(global.callbacks.has(doubleShift.togglePanel)).toBe(true);
    expect(factory).not.toHaveBeenCalled();

    await manager.setCaptureEnabled(true);
    expect(factory).toHaveBeenCalledOnce();
    expect(createdMonitor.start).toHaveBeenCalledOnce();
    global.callbacks.get(doubleShift.togglePanel)?.();
    expect(onTogglePanel).toHaveBeenCalledOnce();

    await manager.setCaptureEnabled(false);
    expect(createdMonitor.stop).toHaveBeenCalledOnce();
    expect(global.callbacks.has(doubleShift.togglePanel)).toBe(true);
  });

  it("uses exactly one conventional capture accelerator and stops Double Shift", async () => {
    const { manager, global, createdMonitor, onCapture } = setup();
    await manager.apply(doubleShift);
    await manager.setCaptureEnabled(true);
    await expect(manager.apply(accelerator)).resolves.toMatchObject({ ok: true });

    expect(createdMonitor.stop).toHaveBeenCalledOnce();
    expect([...global.callbacks.keys()].sort()).toEqual(
      [accelerator.capture.kind === "accelerator" ? accelerator.capture.accelerator : "", accelerator.togglePanel].sort(),
    );
    global.callbacks.get("CommandOrControl+Shift+C")?.();
    expect(onCapture).toHaveBeenCalledOnce();
  });

  it("rejects conflicts before changing valid bindings", async () => {
    const { manager, global } = setup();
    await manager.apply(accelerator);
    await manager.setCaptureEnabled(true);
    const before = [...global.callbacks.keys()].sort();

    const result = await manager.apply({
      capture: { kind: "accelerator", accelerator: accelerator.togglePanel },
      togglePanel: accelerator.togglePanel,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "shortcut_conflict" },
    });
    expect([...global.callbacks.keys()].sort()).toEqual(before);
  });

  it("rolls back a failed registration, including accelerator swaps", async () => {
    const { manager, global } = setup();
    await manager.apply(accelerator);
    await manager.setCaptureEnabled(true);
    const previous = [...global.callbacks.keys()].sort();
    global.blocked.add("CommandOrControl+Alt+P");

    const failed = await manager.apply({
      capture: {
        kind: "accelerator",
        accelerator: accelerator.togglePanel,
      },
      togglePanel: "CommandOrControl+Alt+P",
    });

    expect(failed).toMatchObject({
      ok: false,
      error: { code: "shortcut_conflict" },
    });
    expect([...global.callbacks.keys()].sort()).toEqual(previous);
    expect(manager.currentPreferences()).toEqual(accelerator);
  });

  it("restores the prior toggle when monitor startup fails", async () => {
    const failedMonitor = monitor(false);
    const { manager, global } = setup(failedMonitor);
    await manager.apply(doubleShift);

    const failed = await manager.setCaptureEnabled(true);

    expect(failed).toMatchObject({ ok: false, error: { code: "shortcut_conflict" } });
    expect(global.callbacks.has(doubleShift.togglePanel)).toBe(true);
    expect(failedMonitor.stop).toHaveBeenCalledOnce();
  });

  it("disposes every owned registration and monitor exactly once", async () => {
    const { manager, global, createdMonitor } = setup();
    await manager.apply(doubleShift);
    await manager.setCaptureEnabled(true);

    manager.dispose();
    manager.dispose();

    expect(global.callbacks.size).toBe(0);
    expect(createdMonitor.stop).toHaveBeenCalledOnce();
  });
});
