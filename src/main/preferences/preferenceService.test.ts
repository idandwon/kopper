import { describe, expect, it, vi } from "vitest";

import {
  createEmptyDocument,
  type ShortcutPreferences,
} from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import type { CaptureMonitor } from "../capture/captureRuntime";
import { MainOperationCoordinator } from "../domain/mainOperationCoordinator";
import { ShortcutManager } from "../shortcuts/shortcutManager";
import {
  PreferenceService,
  type PreferenceRepository,
  type PreferenceShortcutPort,
} from "./preferenceService";

const writeFailure: Result<never, KopperError> = {
  ok: false,
  error: {
    code: "write_failed",
    message: "disk full",
    retryable: true,
  },
};
const conflict: Result<never, KopperError> = {
  ok: false,
  error: {
    code: "shortcut_conflict",
    message: "already in use",
    retryable: false,
  },
};

function setup() {
  let document = createEmptyDocument(new Date("2026-08-16T12:00:00.000Z"));
  let nativeShortcuts: ShortcutPreferences | undefined = structuredClone(
    document.shortcuts,
  );
  const replace = vi.fn<PreferenceRepository["replace"]>(async (next) => {
    document = structuredClone(next);
    return { ok: true as const, value: structuredClone(document) };
  });
  const repository: PreferenceRepository & { replace: typeof replace } = {
    snapshot: vi.fn(() => structuredClone(document)),
    replace,
  };
  const shortcuts: PreferenceShortcutPort = {
    currentPreferences: vi.fn(() =>
      nativeShortcuts === undefined ? undefined : structuredClone(nativeShortcuts),
    ),
    validate: vi.fn(() => ({ ok: true as const, value: undefined })),
    apply: vi.fn(async (next) => {
      nativeShortcuts = structuredClone(next);
      return { ok: true as const, value: undefined };
    }),
    reset: vi.fn(() => {
      nativeShortcuts = undefined;
    }),
  };
  let pinned = document.window.pinned;
  let bounds = { x: 100, y: 100, width: 380, height: 640 };
  const window = {
    getPinned: vi.fn(() => pinned),
    getBounds: vi.fn(() => structuredClone(bounds)),
    setPinned: vi.fn((next: boolean) => {
      pinned = next;
    }),
    setBounds: vi.fn((next: typeof bounds | null) => {
      if (next !== null) bounds = structuredClone(next);
    }),
  };
  const publish = vi.fn();
  const service = new PreferenceService(
    repository,
    shortcuts,
    window,
    new MainOperationCoordinator(),
    { publish },
  );
  return {
    service,
    repository,
    shortcuts,
    window,
    publish,
    current: () => structuredClone(document),
    native: () =>
      nativeShortcuts === undefined ? undefined : structuredClone(nativeShortcuts),
  };
}

const customShortcuts: ShortcutPreferences = {
  capture: { kind: "accelerator", accelerator: "CommandOrControl+Alt+C" },
  togglePanel: "CommandOrControl+Alt+K",
};

function nativeShortcutFixture() {
  let document = createEmptyDocument(new Date("2026-08-16T12:00:00.000Z"));
  const callbacks = new Map<string, () => void>();
  const blocked = new Set<string>();
  const globalShortcut = {
    register: vi.fn((accelerator: string, callback: () => void) => {
      if (blocked.has(accelerator) || callbacks.has(accelerator)) return false;
      callbacks.set(accelerator, callback);
      return true;
    }),
    unregister: vi.fn((accelerator: string) => callbacks.delete(accelerator)),
  };
  const monitor: CaptureMonitor = {
    start: vi.fn(() => ({ ok: true as const, value: undefined })),
    stop: vi.fn(),
  };
  const manager = new ShortcutManager(globalShortcut, vi.fn(async () => monitor), {
    onCapture: vi.fn(),
    onTogglePanel: vi.fn(),
  });
  const repository: PreferenceRepository = {
    snapshot: () => structuredClone(document),
    replace: vi.fn(async (next) => {
      document = structuredClone(next);
      return { ok: true as const, value: structuredClone(document) };
    }),
  };
  const service = new PreferenceService(
    repository,
    manager,
    {
      getPinned: () => false,
      getBounds: () => ({ x: 100, y: 100, width: 380, height: 640 }),
      setPinned: vi.fn(),
      setBounds: vi.fn(),
    },
    new MainOperationCoordinator(),
    { publish: vi.fn() },
  );
  return {
    service,
    manager,
    callbacks,
    blocked,
    repository,
    current: () => structuredClone(document),
  };
}

describe("PreferenceService", () => {
  it("acknowledges a shortcut save only after native apply and persistence", async () => {
    const { service, repository, shortcuts, publish, current } = setup();
    const result = await service.setShortcuts(customShortcuts);

    expect(result).toMatchObject({ ok: true });
    expect(shortcuts.apply).toHaveBeenCalledWith(customShortcuts);
    expect(repository.replace).toHaveBeenCalledOnce();
    expect(current().shortcuts).toEqual(customShortcuts);
    expect(publish).toHaveBeenCalledWith(current());
  });

  it("rejects a blocked disabled capture accelerator without changing native or persisted preferences", async () => {
    const fixture = nativeShortcutFixture();
    await fixture.manager.apply(fixture.current().shortcuts);
    const previous = fixture.current();
    fixture.blocked.add(customShortcuts.capture.kind === "accelerator" ? customShortcuts.capture.accelerator : "");

    await expect(fixture.service.setShortcuts(customShortcuts)).resolves.toMatchObject({
      ok: false,
      error: { code: "shortcut_conflict" },
    });

    expect(fixture.current()).toEqual(previous);
    expect(fixture.manager.currentPreferences()).toEqual(previous.shortcuts);
    expect(fixture.callbacks.has(previous.shortcuts.togglePanel)).toBe(true);
    expect(fixture.repository.replace).not.toHaveBeenCalled();
  });

  it("persists an allowed disabled accelerator but leaves it inactive until capture is enabled", async () => {
    const fixture = nativeShortcutFixture();
    await fixture.manager.apply(fixture.current().shortcuts);

    await expect(fixture.service.setShortcuts(customShortcuts)).resolves.toMatchObject({
      ok: true,
    });

    expect(fixture.current().shortcuts).toEqual(customShortcuts);
    expect(fixture.callbacks.has(customShortcuts.togglePanel)).toBe(true);
    expect(
      fixture.callbacks.has(
        customShortcuts.capture.kind === "accelerator"
          ? customShortcuts.capture.accelerator
          : "",
      ),
    ).toBe(false);
    await fixture.manager.setCaptureEnabled(true);
    expect(fixture.callbacks.has("CommandOrControl+Alt+C")).toBe(true);
  });

  it("rolls native shortcuts back when persistence fails", async () => {
    const { service, repository, shortcuts, native } = setup();
    const prior = native();
    repository.replace.mockResolvedValueOnce(writeFailure);

    await expect(service.setShortcuts(customShortcuts)).resolves.toEqual(writeFailure);

    expect(shortcuts.apply).toHaveBeenNthCalledWith(1, customShortcuts);
    expect(shortcuts.apply).toHaveBeenNthCalledWith(2, prior);
    expect(native()).toEqual(prior);
  });

  it("does not persist pinning when the native window operation fails", async () => {
    const { service, repository, window } = setup();
    window.setPinned.mockImplementationOnce(() => {
      throw new Error("native detail");
    });

    const result = await service.setPinned(true);

    expect(result).toMatchObject({ ok: false, error: { code: "write_failed" } });
    expect(repository.replace).not.toHaveBeenCalled();
  });

  it("rejects an imported blocked accelerator before replacing source or native preferences", async () => {
    const { service, repository, shortcuts, native, current } = setup();
    const previousDocument = current();
    const previousNative = native();
    vi.mocked(shortcuts.apply).mockResolvedValueOnce(conflict);
    const imported = createEmptyDocument(new Date("2026-08-17T12:00:00.000Z"));
    imported.shortcuts = customShortcuts;
    const persist = vi.fn();

    const result = await service.replaceDocument(imported, persist);

    expect(result).toEqual(conflict);
    expect(persist).not.toHaveBeenCalled();
    expect(repository.snapshot()).toEqual(previousDocument);
    expect(native()).toEqual(previousNative);
  });

  it("rolls all native preferences back when external persistence fails", async () => {
    const { service, shortcuts, window, current } = setup();
    const previous = current();
    const imported = structuredClone(previous);
    imported.shortcuts = customShortcuts;
    imported.window = {
      pinned: true,
      bounds: { x: 50, y: 60, width: 380, height: 640 },
    };

    const result = await service.replaceDocument(imported, async () => writeFailure);

    expect(result).toEqual(writeFailure);
    expect(shortcuts.apply).toHaveBeenLastCalledWith(previous.shortcuts);
    expect(window.setPinned).toHaveBeenLastCalledWith(previous.window.pinned);
    expect(window.setBounds).toHaveBeenLastCalledWith({
      x: 100,
      y: 100,
      width: 380,
      height: 640,
    });
  });
});
