import type { ShortcutPreferences } from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import type { CaptureMonitor } from "../capture/captureRuntime";

export interface GlobalShortcutPort {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

export type ShortcutMonitorFactory = () => Promise<CaptureMonitor>;

export interface ShortcutManagerOptions {
  onCapture(): void;
  onTogglePanel(): void;
}

const shortcutConflict = (message: string): Result<never, KopperError> => ({
  ok: false,
  error: {
    code: "shortcut_conflict",
    message,
    retryable: false,
  },
});

function normalize(accelerator: string): string {
  return accelerator.replaceAll(" ", "").toLowerCase();
}

function isPlausibleAccelerator(accelerator: string): boolean {
  const parts = accelerator.split("+").map((part) => part.trim());
  if (parts.length < 2 || parts.some((part) => part.length === 0)) return false;
  const modifiers = new Set([
    "command",
    "cmd",
    "commandorcontrol",
    "cmdorctrl",
    "control",
    "ctrl",
    "alt",
    "option",
    "shift",
    "super",
    "meta",
  ]);
  return (
    parts.slice(0, -1).every((part) => modifiers.has(part.toLowerCase())) &&
    !modifiers.has(parts.at(-1)?.toLowerCase() ?? "")
  );
}

export function validateShortcutPreferences(
  preferences: ShortcutPreferences,
): Result<void, KopperError> {
  if (!isPlausibleAccelerator(preferences.togglePanel)) {
    return shortcutConflict("Choose a panel shortcut with a modifier and a key.");
  }
  if (
    preferences.capture.kind === "accelerator" &&
    !isPlausibleAccelerator(preferences.capture.accelerator)
  ) {
    return shortcutConflict("Choose a capture shortcut with a modifier and a key.");
  }
  if (
    preferences.capture.kind === "accelerator" &&
    normalize(preferences.capture.accelerator) ===
      normalize(preferences.togglePanel)
  ) {
    return shortcutConflict("Capture and panel shortcuts must be different.");
  }
  return { ok: true, value: undefined };
}

interface ActiveBindings {
  toggle?: string;
  capture?: string;
  monitor?: CaptureMonitor;
}

export class ShortcutManager {
  private preferences: ShortcutPreferences | undefined;
  private captureEnabled = false;
  private active: ActiveBindings = {};
  private disposed = false;

  constructor(
    private readonly globalShortcut: GlobalShortcutPort,
    private readonly createMonitor: ShortcutMonitorFactory,
    private readonly options: ShortcutManagerOptions,
  ) {}

  currentPreferences(): ShortcutPreferences | undefined {
    return this.preferences === undefined
      ? undefined
      : structuredClone(this.preferences);
  }

  validate(preferences: ShortcutPreferences): Result<void, KopperError> {
    return validateShortcutPreferences(preferences);
  }

  async apply(
    preferences: ShortcutPreferences,
  ): Promise<Result<void, KopperError>> {
    if (this.disposed) {
      return shortcutConflict("Keyboard shortcuts are unavailable.");
    }
    const valid = this.validate(preferences);
    if (!valid.ok) return valid;

    const previousPreferences = this.preferences;
    const previousActive = this.active;
    this.deactivate(previousActive);

    const desired = await this.activate(preferences, this.captureEnabled);
    if (desired.ok) {
      this.preferences = structuredClone(preferences);
      this.active = desired.value;
      return { ok: true, value: undefined };
    }

    this.deactivate(desired.partial);
    this.active = {};
    if (previousPreferences !== undefined) {
      const restored = await this.activate(
        previousPreferences,
        this.captureEnabled,
      );
      if (restored.ok) this.active = restored.value;
      else this.deactivate(restored.partial);
    }
    return desired.result;
  }

  async setCaptureEnabled(enabled: boolean): Promise<Result<void, KopperError>> {
    if (this.captureEnabled === enabled) return { ok: true, value: undefined };
    if (this.preferences === undefined) {
      return enabled
        ? shortcutConflict("Capture shortcut preferences are not configured.")
        : { ok: true, value: undefined };
    }

    const previousActive = this.active;
    this.deactivate(previousActive);
    const desired = await this.activate(this.preferences, enabled);
    if (desired.ok) {
      this.active = desired.value;
      this.captureEnabled = enabled;
      return { ok: true, value: undefined };
    }

    this.deactivate(desired.partial);
    const restored = await this.activate(
      this.preferences,
      this.captureEnabled,
    );
    this.active = restored.ok ? restored.value : {};
    if (!restored.ok) this.deactivate(restored.partial);
    return desired.result;
  }

  reset(): void {
    if (this.disposed) return;
    this.deactivate(this.active);
    this.active = {};
    this.preferences = undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.reset();
    this.disposed = true;
  }

  private async activate(
    preferences: ShortcutPreferences,
    captureEnabled: boolean,
  ): Promise<
    | { ok: true; value: ActiveBindings }
    | {
        ok: false;
        partial: ActiveBindings;
        result: Result<never, KopperError>;
      }
  > {
    const active: ActiveBindings = {};
    if (!this.register(preferences.togglePanel, this.options.onTogglePanel)) {
      return {
        ok: false,
        partial: active,
        result: shortcutConflict(
          `The shortcut ${preferences.togglePanel} is already in use.`,
        ),
      };
    }
    active.toggle = preferences.togglePanel;

    if (!captureEnabled) return { ok: true, value: active };
    if (preferences.capture.kind === "accelerator") {
      if (!this.register(preferences.capture.accelerator, this.options.onCapture)) {
        return {
          ok: false,
          partial: active,
          result: shortcutConflict(
            `The shortcut ${preferences.capture.accelerator} is already in use.`,
          ),
        };
      }
      active.capture = preferences.capture.accelerator;
      return { ok: true, value: active };
    }

    try {
      const monitor = await this.createMonitor();
      const started = monitor.start();
      if (!started.ok) {
        try {
          monitor.stop();
        } catch {
          // Failed monitor cleanup is best effort.
        }
        return {
          ok: false,
          partial: active,
          result: shortcutConflict(
            "Double Shift could not be enabled. Check Accessibility access.",
          ),
        };
      }
      active.monitor = monitor;
      return { ok: true, value: active };
    } catch {
      return {
        ok: false,
        partial: active,
        result: shortcutConflict(
          "Double Shift could not be enabled. Check Accessibility access.",
        ),
      };
    }
  }

  private register(accelerator: string, callback: () => void): boolean {
    try {
      return this.globalShortcut.register(accelerator, () => {
        try {
          callback();
        } catch {
          // Native callbacks never receive renderer or application exceptions.
        }
      });
    } catch {
      return false;
    }
  }

  private deactivate(active: ActiveBindings): void {
    if (active.capture !== undefined) this.unregister(active.capture);
    if (active.toggle !== undefined) this.unregister(active.toggle);
    if (active.monitor !== undefined) {
      try {
        active.monitor.stop();
      } catch {
        // Native monitor shutdown is best effort.
      }
    }
  }

  private unregister(accelerator: string): void {
    try {
      this.globalShortcut.unregister(accelerator);
    } catch {
      // Continue transaction cleanup even if Electron reports a stale binding.
    }
  }
}
