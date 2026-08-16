import {
  applyDocumentCommand,
  type DocumentCommand,
} from "../../shared/domain/commands";
import type {
  CaptureShortcut,
  KopperDocument,
  ShortcutPreferences,
  WindowBounds,
} from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import type { MainOperationRunner } from "../domain/mainOperationCoordinator";

export interface PreferenceRepository {
  snapshot(): KopperDocument;
  replace(document: KopperDocument): Promise<Result<KopperDocument, KopperError>>;
}

export interface PreferenceShortcutPort {
  currentPreferences(): ShortcutPreferences | undefined;
  validate(preferences: ShortcutPreferences): Result<void, KopperError>;
  apply(preferences: ShortcutPreferences): Promise<Result<void, KopperError>>;
  reset(): void | Promise<void>;
}

export interface PreferenceWindowPort {
  getPinned(): boolean;
  getBounds(): WindowBounds;
  setPinned(pinned: boolean): void;
  setBounds(bounds: WindowBounds | null): void;
}

export interface PreferenceServiceOptions {
  publish(document: KopperDocument): void;
  preferencesCommitted?(): void | Promise<void>;
}

interface NativePreferenceState {
  shortcuts: ShortcutPreferences | undefined;
  pinned: boolean;
  bounds: WindowBounds;
}

const nativeFailure = (message: string): Result<never, KopperError> => ({
  ok: false,
  error: {
    code: "write_failed",
    message,
    retryable: true,
    recoveryAction: "retry",
  },
});

export class PreferenceService {
  constructor(
    private readonly repository: PreferenceRepository,
    private readonly shortcutManager: PreferenceShortcutPort,
    private readonly windowManager: PreferenceWindowPort,
    private readonly operationCoordinator: MainOperationRunner,
    private readonly options: PreferenceServiceOptions,
  ) {}

  validateShortcuts(preferences: ShortcutPreferences): Result<void, KopperError> {
    return this.shortcutManager.validate(preferences);
  }

  setCapture(
    capture: CaptureShortcut,
  ): Promise<Result<KopperDocument, KopperError>> {
    return this.update({ type: "shortcuts.setCapture", capture });
  }

  setShortcuts(
    preferences: ShortcutPreferences,
  ): Promise<Result<KopperDocument, KopperError>> {
    return this.operationCoordinator.run(async () => {
      const valid = this.shortcutManager.validate(preferences);
      if (!valid.ok) return valid;
      const current = this.repository.snapshot();
      const next = structuredClone(current);
      next.shortcuts = structuredClone(preferences);
      return this.persistPreferenceDocument(next);
    });
  }

  setTogglePanel(
    accelerator: string,
  ): Promise<Result<KopperDocument, KopperError>> {
    return this.update({ type: "shortcuts.setTogglePanel", accelerator });
  }

  setPinned(pinned: boolean): Promise<Result<KopperDocument, KopperError>> {
    return this.update({ type: "window.setPinned", pinned });
  }

  setBounds(
    bounds: WindowBounds | null,
  ): Promise<Result<KopperDocument, KopperError>> {
    return this.update({ type: "window.setBounds", bounds }, false);
  }

  applyStartup(document: KopperDocument): Promise<Result<void, KopperError>> {
    return this.operationCoordinator.run(async () => {
      const previous = this.captureNativeState();
      return this.applyNative(document, previous);
    });
  }

  replaceDocument(
    next: KopperDocument,
    persist: () => Promise<Result<KopperDocument, KopperError>>,
  ): Promise<Result<KopperDocument, KopperError>> {
    return this.operationCoordinator.run(async () => {
      const previousNative = this.captureNativeState();
      const native = await this.applyNative(next, previousNative);
      if (!native.ok) return native;

      const persisted = await persist();
      if (!persisted.ok) await this.rollbackNative(previousNative);
      return persisted;
    });
  }

  private update(
    command: Extract<
      DocumentCommand,
      { type: `shortcuts.${string}` | `window.${string}` }
    >,
    applyWindowBounds = true,
  ): Promise<Result<KopperDocument, KopperError>> {
    return this.operationCoordinator.run(async () => {
      const current = this.repository.snapshot();
      const applied = applyDocumentCommand(current, command, {
        now: () => new Date().toISOString(),
        createId: () => "unused",
      });
      if (!applied.ok) return applied;
      return this.persistPreferenceDocument(applied.value, applyWindowBounds);
    });
  }

  private async persistPreferenceDocument(
    next: KopperDocument,
    applyWindowBounds = true,
  ): Promise<Result<KopperDocument, KopperError>> {
    const previousNative = this.captureNativeState();
    const native = applyWindowBounds
      ? await this.applyNative(next, previousNative)
      : { ok: true as const, value: undefined };
    if (!native.ok) return native;

    const persisted = await this.repository.replace(next);
    if (!persisted.ok) {
      if (applyWindowBounds) await this.rollbackNative(previousNative);
      return persisted;
    }
    this.publishSafely(persisted.value);
    try {
      await this.options.preferencesCommitted?.();
    } catch {
      // The committed document remains authoritative; runtime can retry later.
    }
    return persisted;
  }

  private captureNativeState(): NativePreferenceState {
    return {
      shortcuts: this.shortcutManager.currentPreferences(),
      pinned: this.windowManager.getPinned(),
      bounds: this.windowManager.getBounds(),
    };
  }

  private async applyNative(
    next: KopperDocument,
    previous: NativePreferenceState,
  ): Promise<Result<void, KopperError>> {
    const shortcutsChanged =
      JSON.stringify(previous.shortcuts) !== JSON.stringify(next.shortcuts);
    if (shortcutsChanged) {
      const shortcuts = await this.shortcutManager.apply(next.shortcuts);
      if (!shortcuts.ok) return shortcuts;
    }

    try {
      if (next.window.pinned !== previous.pinned) {
        this.windowManager.setPinned(next.window.pinned);
      }
      if (
        next.window.bounds !== null &&
        JSON.stringify(next.window.bounds) !== JSON.stringify(previous.bounds)
      ) {
        this.windowManager.setBounds(next.window.bounds);
      }
      return { ok: true, value: undefined };
    } catch {
      await this.rollbackNative(previous);
      return nativeFailure("Kopper could not apply the window preference.");
    }
  }

  private async rollbackNative(previous: NativePreferenceState): Promise<void> {
    if (previous.shortcuts === undefined) await this.shortcutManager.reset();
    else await this.shortcutManager.apply(previous.shortcuts);
    try {
      this.windowManager.setPinned(previous.pinned);
      this.windowManager.setBounds(previous.bounds);
    } catch {
      // Persistence failure remains authoritative; rollback is best effort.
    }
  }

  private publishSafely(document: KopperDocument): void {
    try {
      this.options.publish(document);
    } catch {
      // A disappearing renderer cannot invalidate committed preferences.
    }
  }
}
