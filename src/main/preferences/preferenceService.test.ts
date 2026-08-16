import { describe, expect, it, vi } from "vitest";

import {
  createEmptyDocument,
  type ShortcutPreferences,
} from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import { MainOperationCoordinator } from "../domain/mainOperationCoordinator";
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

  it("rejects an imported shortcut conflict before replacing the source document", async () => {
    const { service, repository, shortcuts } = setup();
    vi.mocked(shortcuts.apply).mockResolvedValueOnce(conflict);
    const imported = createEmptyDocument(new Date("2026-08-17T12:00:00.000Z"));
    imported.shortcuts = customShortcuts;
    const persist = vi.fn();

    const result = await service.replaceDocument(imported, persist);

    expect(result).toEqual(conflict);
    expect(persist).not.toHaveBeenCalled();
    expect(repository.snapshot().shortcuts).not.toEqual(customShortcuts);
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
