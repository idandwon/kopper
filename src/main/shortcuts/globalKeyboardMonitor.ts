import type { KopperError, Result } from "../../shared/domain/errors";
import {
  DoubleShiftRecognizer,
  type ModifierEvent,
} from "./doubleShiftRecognizer";

export interface GlobalKeyboardHookEvent {
  keycode: number;
}

export type GlobalKeyboardHookListener = (
  event: GlobalKeyboardHookEvent,
) => void;

export interface GlobalKeyboardHook {
  on(
    event: "keydown" | "keyup",
    listener: GlobalKeyboardHookListener,
  ): unknown;
  off(
    event: "keydown" | "keyup",
    listener: GlobalKeyboardHookListener,
  ): unknown;
  start(): void;
  stop(): void;
}

export interface ModifierEventRecognizer {
  feed(event: ModifierEvent): "capture" | null;
  reset(): void;
}

export interface GlobalKeyboardMonitorDependencies {
  hook: GlobalKeyboardHook;
  keyCodes: {
    shiftLeft: number;
    shiftRight: number;
  };
  now(): number;
  onCapture(): void;
  recognizer?: ModifierEventRecognizer;
}

export type GlobalKeyboardMonitorStartResult = Result<void, KopperError>;

const START_PERMISSION_DENIED: KopperError = {
  code: "permission_denied",
  message: "Kopper could not start global keyboard capture.",
  retryable: true,
  recoveryAction: "open_settings",
};

export class GlobalKeyboardMonitor {
  private readonly recognizer: ModifierEventRecognizer;
  private running = false;
  private acceptingEvents = false;
  private keydownSubscribed = false;
  private keyupSubscribed = false;

  private readonly onKeydown: GlobalKeyboardHookListener = (event) => {
    this.handleKeyboardEvent("down", event);
  };

  private readonly onKeyup: GlobalKeyboardHookListener = (event) => {
    this.handleKeyboardEvent("up", event);
  };

  constructor(private readonly dependencies: GlobalKeyboardMonitorDependencies) {
    this.recognizer = dependencies.recognizer ?? new DoubleShiftRecognizer();
  }

  start(): GlobalKeyboardMonitorStartResult {
    if (this.running) return { ok: true, value: undefined };

    this.recognizer.reset();
    let nativeStartAttempted = false;
    try {
      this.dependencies.hook.on("keydown", this.onKeydown);
      this.keydownSubscribed = true;
      this.dependencies.hook.on("keyup", this.onKeyup);
      this.keyupSubscribed = true;
      this.acceptingEvents = true;
      nativeStartAttempted = true;
      this.dependencies.hook.start();
      this.running = true;
      return { ok: true, value: undefined };
    } catch {
      this.acceptingEvents = false;
      this.running = false;
      this.unsubscribe();
      if (nativeStartAttempted) this.stopNativeSafely();
      this.recognizer.reset();
      return { ok: false, error: { ...START_PERMISSION_DENIED } };
    }
  }

  stop(): void {
    if (!this.running) return;

    this.running = false;
    this.acceptingEvents = false;
    this.unsubscribe();
    this.stopNativeSafely();
    this.recognizer.reset();
  }

  private handleKeyboardEvent(
    type: ModifierEvent["type"],
    event: GlobalKeyboardHookEvent,
  ): void {
    if (!this.acceptingEvents) return;

    try {
      const result = this.recognizer.feed({
        type,
        key: this.mapKey(event.keycode),
        at: this.dependencies.now(),
      });
      if (result === "capture") this.dependencies.onCapture();
    } catch {
      // Native hook callbacks must not escape into uiohook's event loop.
    }
  }

  private mapKey(keycode: number): ModifierEvent["key"] {
    if (keycode === this.dependencies.keyCodes.shiftLeft) return "shift-left";
    if (keycode === this.dependencies.keyCodes.shiftRight) return "shift-right";
    return "other";
  }

  private unsubscribe(): void {
    if (this.keydownSubscribed) {
      try {
        this.dependencies.hook.off("keydown", this.onKeydown);
      } catch {
        // Continue cleanup even if the native emitter rejects one removal.
      }
      this.keydownSubscribed = false;
    }
    if (this.keyupSubscribed) {
      try {
        this.dependencies.hook.off("keyup", this.onKeyup);
      } catch {
        // Continue cleanup even if the native emitter rejects one removal.
      }
      this.keyupSubscribed = false;
    }
  }

  private stopNativeSafely(): void {
    try {
      this.dependencies.hook.stop();
    } catch {
      // Cleanup is best effort and never exposes native failure details.
    }
  }
}

export interface ProductionGlobalKeyboardMonitorOptions {
  onCapture(): void;
  now?: () => number;
}

export async function createGlobalKeyboardMonitor(
  options: ProductionGlobalKeyboardMonitorOptions,
): Promise<GlobalKeyboardMonitor> {
  const { uIOhook, UiohookKey } = await import("uiohook-napi");
  return new GlobalKeyboardMonitor({
    hook: uIOhook,
    keyCodes: {
      shiftLeft: UiohookKey.Shift,
      shiftRight: UiohookKey.ShiftRight,
    },
    now: options.now ?? (() => performance.now()),
    onCapture: options.onCapture,
  });
}
