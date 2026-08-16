import { describe, expect, it, vi } from "vitest";

import type { ModifierEvent } from "./doubleShiftRecognizer";
import {
  createGlobalKeyboardMonitor,
  GlobalKeyboardMonitor,
  type GlobalKeyboardHook,
  type ModifierEventRecognizer,
} from "./globalKeyboardMonitor";

class FakeHook implements GlobalKeyboardHook {
  readonly calls: string[] = [];
  readonly listeners = {
    keydown: new Set<(event: { keycode: number }) => void>(),
    keyup: new Set<(event: { keycode: number }) => void>(),
  };
  startError: unknown;
  startEventKeycode: number | null = null;
  throwOnSubscribe: "keydown" | "keyup" | null = null;
  startCount = 0;
  stopCount = 0;

  on(
    event: "keydown" | "keyup",
    listener: (event: { keycode: number }) => void,
  ): this {
    this.calls.push(`on:${event}`);
    if (this.throwOnSubscribe === event) throw new Error("native subscribe detail");
    this.listeners[event].add(listener);
    return this;
  }

  off(
    event: "keydown" | "keyup",
    listener: (event: { keycode: number }) => void,
  ): this {
    this.calls.push(`off:${event}`);
    this.listeners[event].delete(listener);
    return this;
  }

  start(): void {
    this.calls.push("start");
    this.startCount += 1;
    if (this.startEventKeycode !== null) {
      this.emit("keydown", this.startEventKeycode);
    }
    if (this.startError !== undefined) throw this.startError;
  }

  stop(): void {
    this.calls.push("stop");
    this.stopCount += 1;
  }

  emit(event: "keydown" | "keyup", keycode: number): void {
    for (const listener of [...this.listeners[event]]) listener({ keycode });
  }
}

function recordingRecognizer() {
  const events: ModifierEvent[] = [];
  const recognizer: ModifierEventRecognizer = {
    feed: vi.fn((event: ModifierEvent) => {
      events.push(event);
      return null;
    }),
    reset: vi.fn(),
  };
  return { events, recognizer };
}

function createMonitor(
  hook: FakeHook,
  overrides: Partial<
    ConstructorParameters<typeof GlobalKeyboardMonitor>[0]
  > = {},
): GlobalKeyboardMonitor {
  return new GlobalKeyboardMonitor({
    hook,
    keyCodes: { shiftLeft: 42, shiftRight: 54 },
    now: () => 100,
    onCapture: vi.fn(),
    ...overrides,
  });
}

const permissionDenied = {
  ok: false,
  error: {
    code: "permission_denied",
    message: "Kopper could not start global keyboard capture.",
    retryable: true,
    recoveryAction: "open_settings",
  },
} as const;

describe("GlobalKeyboardMonitor", () => {
  it("subscribes before synchronous start and maps only keycode with injected time", () => {
    const hook = new FakeHook();
    const { events, recognizer } = recordingRecognizer();
    const times = [10, 20, 30];
    const monitor = createMonitor(hook, {
      recognizer,
      now: () => times.shift() ?? -1,
    });

    expect(monitor.start()).toEqual({ ok: true, value: undefined });
    expect(hook.calls).toEqual(["on:keydown", "on:keyup", "start"]);

    hook.emit("keydown", 42);
    hook.emit("keyup", 54);
    hook.emit("keydown", 999);

    expect(events).toEqual([
      { type: "down", key: "shift-left", at: 10 },
      { type: "up", key: "shift-right", at: 20 },
      { type: "down", key: "other", at: 30 },
    ]);
  });

  it("coalesces repeated non-Shift keydown events", () => {
    const hook = new FakeHook();
    const { events, recognizer } = recordingRecognizer();
    const monitor = createMonitor(hook, { recognizer });
    monitor.start();

    hook.emit("keydown", 100);
    hook.emit("keydown", 100);
    hook.emit("keydown", 100);
    hook.emit("keyup", 100);

    expect(events).toEqual([
      { type: "down", key: "other", at: 100 },
      { type: "up", key: "other", at: 100 },
    ]);
  });

  it("ignores duplicate and unpaired non-Shift keyup events", () => {
    const hook = new FakeHook();
    const { events, recognizer } = recordingRecognizer();
    const monitor = createMonitor(hook, { recognizer });
    monitor.start();

    hook.emit("keyup", 100);
    hook.emit("keydown", 100);
    hook.emit("keyup", 100);
    hook.emit("keyup", 100);

    expect(events).toEqual([
      { type: "down", key: "other", at: 100 },
      { type: "up", key: "other", at: 100 },
    ]);
  });

  it("keeps recognition cancelled until every physical non-Shift key is up", () => {
    const hook = new FakeHook();
    const onCapture = vi.fn();
    const monitor = createMonitor(hook, { onCapture });
    monitor.start();

    hook.emit("keydown", 100);
    hook.emit("keydown", 101);
    hook.emit("keyup", 100);
    hook.emit("keydown", 42);
    hook.emit("keyup", 42);
    hook.emit("keydown", 54);
    hook.emit("keyup", 54);
    expect(onCapture).not.toHaveBeenCalled();

    hook.emit("keyup", 101);
    hook.emit("keydown", 42);
    hook.emit("keyup", 42);
    hook.emit("keydown", 54);
    hook.emit("keyup", 54);
    expect(onCapture).toHaveBeenCalledTimes(1);
  });

  it("publishes capture and contains callback exceptions inside the listener", () => {
    const hook = new FakeHook();
    const onCapture = vi.fn(() => {
      throw new Error("consumer detail");
    });
    const monitor = createMonitor(hook, { onCapture });
    monitor.start();

    expect(() => {
      hook.emit("keydown", 42);
      hook.emit("keyup", 42);
      hook.emit("keydown", 54);
      hook.emit("keyup", 54);
    }).not.toThrow();
    expect(onCapture).toHaveBeenCalledTimes(1);
  });

  it("starts and stops idempotently, unsubscribing before native stop", () => {
    const hook = new FakeHook();
    const monitor = createMonitor(hook);

    expect(monitor.start()).toEqual({ ok: true, value: undefined });
    expect(monitor.start()).toEqual({ ok: true, value: undefined });
    monitor.stop();
    monitor.stop();

    expect(hook.startCount).toBe(1);
    expect(hook.stopCount).toBe(1);
    expect(hook.calls).toEqual([
      "on:keydown",
      "on:keyup",
      "start",
      "off:keydown",
      "off:keyup",
      "stop",
    ]);
    expect(hook.listeners.keydown.size).toBe(0);
    expect(hook.listeners.keyup.size).toBe(0);
  });

  it("sanitizes a native start failure, fully cleans up, and restarts cleanly", () => {
    const hook = new FakeHook();
    const { recognizer } = recordingRecognizer();
    const monitor = createMonitor(hook, { recognizer });
    hook.startError = new Error("sensitive native detail");

    expect(monitor.start()).toEqual(permissionDenied);
    expect(hook.listeners.keydown.size).toBe(0);
    expect(hook.listeners.keyup.size).toBe(0);
    expect(hook.stopCount).toBe(1);
    expect(recognizer.reset).toHaveBeenCalledTimes(2);

    hook.startError = undefined;
    expect(monitor.start()).toEqual({ ok: true, value: undefined });
    expect(hook.startCount).toBe(2);
    expect(hook.listeners.keydown.size).toBe(1);
    expect(hook.listeners.keyup.size).toBe(1);
  });

  it("clears held non-Shift keys after a failed native start", () => {
    const hook = new FakeHook();
    const { events, recognizer } = recordingRecognizer();
    const monitor = createMonitor(hook, { recognizer });
    hook.startEventKeycode = 100;
    hook.startError = new Error("sensitive native detail");

    expect(monitor.start()).toEqual(permissionDenied);
    events.length = 0;
    hook.startEventKeycode = null;
    hook.startError = undefined;

    expect(monitor.start()).toEqual({ ok: true, value: undefined });
    hook.emit("keyup", 100);
    expect(events).toEqual([]);

    hook.emit("keydown", 100);
    hook.emit("keyup", 100);
    expect(events).toEqual([
      { type: "down", key: "other", at: 100 },
      { type: "up", key: "other", at: 100 },
    ]);
  });

  it("removes a partial subscription without stopping when subscription fails", () => {
    const hook = new FakeHook();
    const { recognizer } = recordingRecognizer();
    const monitor = createMonitor(hook, { recognizer });
    hook.throwOnSubscribe = "keyup";

    expect(monitor.start()).toEqual(permissionDenied);
    expect(hook.listeners.keydown.size).toBe(0);
    expect(hook.startCount).toBe(0);
    expect(hook.stopCount).toBe(0);
    expect(recognizer.reset).toHaveBeenCalledTimes(2);
  });

  it("clears held non-Shift keys across stop and restart", () => {
    const hook = new FakeHook();
    const { events, recognizer } = recordingRecognizer();
    const monitor = createMonitor(hook, { recognizer });

    monitor.start();
    hook.emit("keydown", 100);
    monitor.stop();
    events.length = 0;

    monitor.start();
    hook.emit("keyup", 100);
    expect(events).toEqual([]);

    hook.emit("keydown", 100);
    hook.emit("keyup", 100);
    expect(events).toEqual([
      { type: "down", key: "other", at: 100 },
      { type: "up", key: "other", at: 100 },
    ]);
  });

  it("a stopped adapter restarts without a partial first tap", () => {
    const hook = new FakeHook();
    const onCapture = vi.fn();
    const monitor = createMonitor(hook, { onCapture });

    monitor.start();
    hook.emit("keydown", 42);
    hook.emit("keyup", 42);
    monitor.stop();

    monitor.start();
    hook.emit("keydown", 42);
    hook.emit("keyup", 42);
    expect(onCapture).not.toHaveBeenCalled();

    hook.emit("keydown", 54);
    hook.emit("keyup", 54);
    expect(onCapture).toHaveBeenCalledTimes(1);
  });
});

describe("createGlobalKeyboardMonitor", () => {
  it("loads and adapts uiohook-napi only when the async factory is called", async () => {
    const hook = new FakeHook();
    vi.doMock("uiohook-napi", () => ({
      uIOhook: hook,
      UiohookKey: { Shift: 111, ShiftRight: 222 },
    }));

    const monitor = await createGlobalKeyboardMonitor({
      now: () => 1,
      onCapture: vi.fn(),
    });
    expect(monitor.start()).toEqual({ ok: true, value: undefined });

    hook.emit("keydown", 111);
    hook.emit("keyup", 111);
    monitor.stop();
    vi.doUnmock("uiohook-napi");
  });
});
