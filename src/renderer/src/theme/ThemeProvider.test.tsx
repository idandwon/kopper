import "@testing-library/jest-dom/vitest";

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  KopperDocument,
  ThemeDefinition,
} from "../../../shared/domain/document";
import type { KopperApi } from "../../../shared/ipc/contract";
import {
  OXIDE_LEDGER_THEME,
  SHADCN_DEFAULT_THEME,
} from "../../../shared/theme/presets";
import {
  useKopperDocument,
  type KopperDocumentContextValue,
} from "../app/DocumentProvider";
import { ThemeProvider, useTheme } from "./ThemeProvider";

vi.mock("../app/DocumentProvider", () => ({ useKopperDocument: vi.fn() }));

const mockedUseKopperDocument = vi.mocked(useKopperDocument);
const execute = vi.fn<KopperDocumentContextValue["execute"]>();
let frames: FrameRequestCallback[];
let nativeListener: ((useDarkColors: boolean) => void) | undefined;
let unsubscribeNative: ReturnType<typeof vi.fn>;
let getNativeAppearance: ReturnType<typeof vi.fn>;
let subscriptionOrder: string[];

function makeDocument(
  overrides: Partial<KopperDocument["appearance"]> = {},
  customThemes: ThemeDefinition[] = [],
): KopperDocument {
  return {
    schemaVersion: 1,
    sections: [
      {
        id: "inbox",
        title: "Inbox",
        order: 0,
        createdAt: "2026-08-16T12:00:00.000Z",
        updatedAt: "2026-08-16T12:00:00.000Z",
      },
    ],
    notes: [],
    activeSectionId: "inbox",
    shortcuts: {
      capture: { kind: "double-modifier", modifier: "shift" },
      togglePanel: "CommandOrControl+Shift+Space",
    },
    window: { pinned: false, bounds: null },
    appearance: {
      mode: "system",
      activeThemeId: OXIDE_LEDGER_THEME.id,
      ...overrides,
    },
    customThemes,
    draft: null,
  };
}

function customTheme(id = "custom:workshop"): ThemeDefinition {
  return {
    ...structuredClone(OXIDE_LEDGER_THEME),
    id,
    name: "Workshop Custom",
    light: {
      ...OXIDE_LEDGER_THEME.light,
      background: "rgb(240 241 242)",
      radius: "1.125rem",
    },
    dark: {
      ...OXIDE_LEDGER_THEME.dark,
      background: "rgb(20 21 22)",
      radius: "1.125rem",
    },
  };
}

function setDocumentContext(
  document: KopperDocument,
  ready = true,
): KopperDocumentContextValue {
  const value: KopperDocumentContextValue = {
    document,
    ready,
    pendingAction: null,
    error: null,
    execute,
    undo: vi.fn(),
    retryLastAction: vi.fn(),
    clearError: vi.fn(),
  };
  mockedUseKopperDocument.mockReturnValue(value);
  return value;
}

function wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value) {
      resolvePromise?.(value);
    },
  };
}

function flushFrames(): void {
  const queued = frames;
  frames = [];
  queued.forEach((callback) => callback(0));
}

beforeEach(() => {
  frames = [];
  subscriptionOrder = [];
  nativeListener = undefined;
  unsubscribeNative = vi.fn();
  execute.mockReset().mockResolvedValue(true);
  getNativeAppearance = vi.fn(async () => {
    subscriptionOrder.push("get");
    return { ok: true as const, value: false };
  });
  window.kopper = {
    getNativeAppearance,
    onNativeAppearanceChanged: vi.fn((listener) => {
      subscriptionOrder.push("subscribe");
      nativeListener = listener;
      return unsubscribeNative;
    }),
  } as unknown as KopperApi;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  document.documentElement.className = "";
  document.documentElement.removeAttribute("style");
  setDocumentContext(makeDocument({ mode: "light" }));
});

afterEach(() => {
  cleanup();
  flushFrames();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("style");
});

describe("ThemeProvider resolution and root application", () => {
  it("resolves explicit light and dark modes and applies root state", async () => {
    const lightDocument = makeDocument({ mode: "light" });
    setDocumentContext(lightDocument);
    const rendered = renderHook(() => useTheme(), { wrapper });

    expect(rendered.result.current.resolvedMode).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("light");
    flushFrames();
    expect(
      document.documentElement.style.getPropertyValue("--background"),
    ).toBe(OXIDE_LEDGER_THEME.light.background);

    setDocumentContext(makeDocument({ mode: "dark" }));
    rendered.rerender();
    expect(rendered.result.current.resolvedMode).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    flushFrames();
    expect(
      document.documentElement.style.getPropertyValue("--background"),
    ).toBe(OXIDE_LEDGER_THEME.dark.background);
  });

  it("subscribes before getting native appearance and ignores a stale getter", async () => {
    let resolveGetter:
      | ((result: { ok: true; value: boolean }) => void)
      | undefined;
    getNativeAppearance.mockImplementation(
      () =>
        new Promise((resolve) => {
          subscriptionOrder.push("get");
          resolveGetter = resolve;
        }),
    );
    setDocumentContext(makeDocument({ mode: "system" }));

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(subscriptionOrder).toEqual(["subscribe", "get"]);

    act(() => nativeListener?.(true));
    expect(result.current.resolvedMode).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    await act(async () => resolveGetter?.({ ok: true, value: false }));
    expect(result.current.resolvedMode).toBe("dark");

    act(() => nativeListener?.(false));
    expect(result.current.resolvedMode).toBe("light");
  });

  it("accepts a successful native getter for system mode without a prior event", async () => {
    getNativeAppearance.mockResolvedValue({ ok: true, value: true });
    setDocumentContext(makeDocument({ mode: "system" }));
    const { result } = renderHook(() => useTheme(), { wrapper });

    await waitFor(() => expect(result.current.resolvedMode).toBe("dark"));
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("defaults a failed native getter to light until an event arrives", async () => {
    getNativeAppearance.mockRejectedValue(new Error("unavailable"));
    setDocumentContext(makeDocument({ mode: "system" }));
    const { result } = renderHook(() => useTheme(), { wrapper });

    await waitFor(() => expect(getNativeAppearance).toHaveBeenCalledOnce());
    expect(result.current.resolvedMode).toBe("light");
    act(() => nativeListener?.(true));
    expect(result.current.resolvedMode).toBe("dark");
  });

  it("restores pre-existing root dark membership and prioritized color scheme", () => {
    document.documentElement.classList.add("dark");
    document.documentElement.style.setProperty(
      "color-scheme",
      "only light",
      "important",
    );
    setDocumentContext(makeDocument({ mode: "light" }));

    const rendered = renderHook(() => useTheme(), { wrapper });
    expect(document.documentElement).not.toHaveClass("dark");
    expect(
      document.documentElement.style.getPropertyValue("color-scheme"),
    ).toBe("light");
    expect(
      document.documentElement.style.getPropertyPriority("color-scheme"),
    ).toBe("");

    rendered.unmount();
    expect(document.documentElement).toHaveClass("dark");
    expect(
      document.documentElement.style.getPropertyValue("color-scheme"),
    ).toBe("only light");
    expect(
      document.documentElement.style.getPropertyPriority("color-scheme"),
    ).toBe("important");
  });

  it("survives StrictMode effect cycling with one live native subscription and clean restoration", async () => {
    const listeners = new Set<(useDarkColors: boolean) => void>();
    const getterResults = [
      deferred<{ ok: true; value: boolean }>(),
      deferred<{ ok: true; value: boolean }>(),
    ];
    getNativeAppearance.mockImplementation(
      () => getterResults[getNativeAppearance.mock.calls.length - 1].promise,
    );
    window.kopper.onNativeAppearanceChanged = vi.fn((listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    });
    document.documentElement.classList.add("dark");
    document.documentElement.style.setProperty(
      "color-scheme",
      "only light",
      "important",
    );
    setDocumentContext(makeDocument({ mode: "system" }));

    const rendered = renderHook(() => useTheme(), {
      wrapper,
      reactStrictMode: true,
    });
    expect(window.kopper.onNativeAppearanceChanged).toHaveBeenCalledTimes(2);
    expect(getNativeAppearance).toHaveBeenCalledTimes(2);
    expect(listeners.size).toBe(1);
    expect(rendered.result.current.resolvedMode).toBe("light");

    await act(async () => getterResults[0].resolve({ ok: true, value: true }));
    expect(rendered.result.current.resolvedMode).toBe("light");

    act(() => listeners.forEach((listener) => listener(true)));
    expect(rendered.result.current.resolvedMode).toBe("dark");
    await act(async () => getterResults[1].resolve({ ok: true, value: false }));
    expect(rendered.result.current.resolvedMode).toBe("dark");

    rendered.unmount();
    expect(listeners.size).toBe(0);
    expect(document.documentElement).toHaveClass("dark");
    expect(
      document.documentElement.style.getPropertyValue("color-scheme"),
    ).toBe("only light");
    expect(
      document.documentElement.style.getPropertyPriority("color-scheme"),
    ).toBe("important");
  });

  it("keeps explicit mode independent of native events and unsubscribes", () => {
    setDocumentContext(makeDocument({ mode: "dark" }));
    const rendered = renderHook(() => useTheme(), { wrapper });

    act(() => nativeListener?.(false));
    expect(rendered.result.current.resolvedMode).toBe("dark");

    rendered.unmount();
    expect(unsubscribeNative).toHaveBeenCalledOnce();
  });

  it("uses Default while unloaded and for a missing active ID without persistence", () => {
    const availableCustom = customTheme();
    const renderedDocument = makeDocument(
      { mode: "light", activeThemeId: availableCustom.id },
      [availableCustom],
    );
    setDocumentContext(renderedDocument, false);
    const rendered = renderHook(() => useTheme(), { wrapper });
    expect(rendered.result.current.activeTheme).toBe(SHADCN_DEFAULT_THEME);

    setDocumentContext(
      makeDocument({ mode: "light", activeThemeId: "custom:missing" }, [
        availableCustom,
      ]),
      true,
    );
    rendered.rerender();
    expect(rendered.result.current.activeTheme).toBe(SHADCN_DEFAULT_THEME);
    expect(execute).not.toHaveBeenCalled();
  });

  it("projects legacy bundled IDs as Default and preserves a resolved custom theme", () => {
    setDocumentContext(
      makeDocument({ mode: "light", activeThemeId: "builtin:night-workshop" }),
    );
    const rendered = renderHook(() => useTheme(), { wrapper });
    expect(rendered.result.current.activeTheme).toBe(SHADCN_DEFAULT_THEME);

    const custom = customTheme();
    setDocumentContext(
      makeDocument({ mode: "dark", activeThemeId: custom.id }, [custom]),
    );
    rendered.rerender();
    expect(rendered.result.current.activeTheme).toBe(custom);
  });
});

describe("ThemeProvider previews", () => {
  const previewOwner = Symbol("theme provider test preview");
  it("keeps preview in renderer memory and cancel restores persisted tokens", () => {
    setDocumentContext(makeDocument({ mode: "light" }));
    const theme = customTheme();
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.previewTheme(previewOwner, theme));
    expect(result.current.activeTheme).toBe(theme);
    flushFrames();
    expect(
      document.documentElement.style.getPropertyValue("--background"),
    ).toBe(theme.light.background);
    expect(execute).not.toHaveBeenCalled();

    act(() => result.current.cancelPreview(previewOwner));
    expect(result.current.activeTheme).toBe(OXIDE_LEDGER_THEME);
    flushFrames();
    expect(
      document.documentElement.style.getPropertyValue("--background"),
    ).toBe(OXIDE_LEDGER_THEME.light.background);
    expect(execute).not.toHaveBeenCalled();
  });

  it("uses a preview-only mode override, ignores native changes, and cancel restores persisted mode and tokens", () => {
    setDocumentContext(makeDocument({ mode: "light" }));
    const theme = customTheme();
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.previewTheme(previewOwner, theme, "dark"));
    expect(result.current.resolvedMode).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
    flushFrames();
    expect(document.documentElement.style.getPropertyValue("--background")).toBe(
      theme.dark.background,
    );

    act(() => nativeListener?.(true));
    act(() => nativeListener?.(false));
    expect(result.current.resolvedMode).toBe("dark");

    act(() => result.current.cancelPreview(previewOwner));
    expect(result.current.resolvedMode).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
    flushFrames();
    expect(document.documentElement.style.getPropertyValue("--background")).toBe(
      OXIDE_LEDGER_THEME.light.background,
    );
  });

  it("retains preview when upsert fails and does not attempt activation", async () => {
    const theme = customTheme();
    execute.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.previewTheme(previewOwner, theme));

    await act(async () => {
      await expect(
        result.current.savePreview(previewOwner, theme),
      ).resolves.toEqual({
        status: "upsert_failed",
      });
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({
      type: "appearance.upsertCustomTheme",
      theme,
    });
    expect(result.current.activeTheme).toBe(theme);
  });

  it("waits for upsert before activation and retains preview if activation fails", async () => {
    const theme = customTheme();
    let resolveUpsert: ((value: boolean) => void) | undefined;
    execute
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveUpsert = resolve;
          }),
      )
      .mockResolvedValueOnce(false);
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.previewTheme(previewOwner, theme));

    let saving: ReturnType<typeof result.current.savePreview> | undefined;
    act(() => {
      saving = result.current.savePreview(previewOwner, theme);
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.current.activeTheme).toBe(theme);

    await act(async () => resolveUpsert?.(true));
    await expect(saving).resolves.toEqual({ status: "activation_failed" });
    expect(execute.mock.calls).toEqual([
      [{ type: "appearance.upsertCustomTheme", theme }],
      [{ type: "appearance.setActiveTheme", themeId: theme.id }],
    ]);
    expect(result.current.activeTheme).toBe(theme);
  });

  it("clears preview only after both save commands succeed", async () => {
    const theme = customTheme();
    execute.mockResolvedValue(true);
    const persistedDocument = makeDocument({ mode: "light" });
    setDocumentContext(persistedDocument);
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.previewTheme(previewOwner, theme));

    await act(async () => {
      await expect(
        result.current.savePreview(previewOwner, theme),
      ).resolves.toEqual({
        status: "saved",
      });
    });
    expect(execute.mock.calls).toEqual([
      [{ type: "appearance.upsertCustomTheme", theme }],
      [{ type: "appearance.setActiveTheme", themeId: theme.id }],
    ]);
    expect(result.current.activeTheme).toBe(OXIDE_LEDGER_THEME);
    expect(persistedDocument.appearance.activeThemeId).toBe(
      OXIDE_LEDGER_THEME.id,
    );
    expect(persistedDocument.customThemes).toEqual([]);
  });

  it("installs the exact saved object, clears it on success, and renders a later activation", async () => {
    const editedPreview = customTheme();
    const persistedCopy = structuredClone(editedPreview);
    const laterTheme = { ...customTheme("custom:later"), name: "Later Theme" };
    const rendered = renderHook(() => useTheme(), { wrapper });

    act(() =>
      rendered.result.current.previewTheme(previewOwner, editedPreview),
    );
    await act(async () => {
      await expect(
        rendered.result.current.savePreview(previewOwner, persistedCopy),
      ).resolves.toEqual({ status: "saved" });
    });
    expect(rendered.result.current.activeTheme).toBe(OXIDE_LEDGER_THEME);

    setDocumentContext(
      makeDocument({ mode: "light", activeThemeId: laterTheme.id }, [
        persistedCopy,
        laterTheme,
      ]),
    );
    rendered.rerender();
    expect(rendered.result.current.activeTheme).toBe(laterTheme);
    flushFrames();
    expect(
      document.documentElement.style.getPropertyValue("--background"),
    ).toBe(laterTheme.light.background);
  });

  it("restores persisted mode after a successful mode-overridden save", async () => {
    const theme = customTheme();
    const upsert = deferred<boolean>();
    const activate = deferred<boolean>();
    execute
      .mockImplementationOnce(() => upsert.promise)
      .mockImplementationOnce(() => activate.promise);
    const { result } = renderHook(() => useTheme(), { wrapper });

    let saving: ReturnType<typeof result.current.savePreview> | undefined;
    act(() => {
      saving = result.current.savePreview(previewOwner, theme, "dark");
    });
    expect(result.current.resolvedMode).toBe("dark");
    await act(async () => upsert.resolve(true));
    expect(result.current.resolvedMode).toBe("dark");
    await act(async () => activate.resolve(true));
    await expect(saving).resolves.toEqual({ status: "saved" });
    expect(result.current.resolvedMode).toBe("light");
    expect(result.current.activeTheme).toBe(OXIDE_LEDGER_THEME);
  });

  it("lets an unmounted preview owner release only its own preview", () => {
    const firstOwner = Symbol("first preview owner");
    const newerOwner = Symbol("newer preview owner");
    const firstTheme = customTheme("custom:first");
    const newerTheme = customTheme("custom:newer");
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.previewTheme(firstOwner, firstTheme, "dark"));
    act(() => result.current.previewTheme(newerOwner, newerTheme, "light"));
    act(() => result.current.cancelPreview(firstOwner));

    expect(result.current.activeTheme).toBe(newerTheme);
    expect(result.current.resolvedMode).toBe("light");

    act(() => result.current.cancelPreview(newerOwner));
    expect(result.current.activeTheme).toBe(OXIDE_LEDGER_THEME);
  });

  it("does not clear a newer same-ID preview object or its mode when an earlier save completes", async () => {
    const savedTheme = customTheme();
    const newerPreview = {
      ...customTheme(savedTheme.id),
      name: "Workshop Custom Revised",
    };
    const upsert = deferred<boolean>();
    const activate = deferred<boolean>();
    execute
      .mockImplementationOnce(() => upsert.promise)
      .mockImplementationOnce(() => activate.promise);
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.previewTheme(previewOwner, savedTheme, "dark"));

    let saving: ReturnType<typeof result.current.savePreview> | undefined;
    act(() => {
      saving = result.current.savePreview(previewOwner, savedTheme, "dark");
    });
    expect(execute).toHaveBeenCalledOnce();

    act(() =>
      result.current.previewTheme(
        Symbol("newer save preview"),
        newerPreview,
        "light",
      ),
    );
    expect(result.current.activeTheme).toBe(newerPreview);
    expect(result.current.resolvedMode).toBe("light");

    await act(async () => upsert.resolve(true));
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.current.activeTheme).toBe(newerPreview);

    await act(async () => activate.resolve(true));
    await expect(saving).resolves.toEqual({ status: "saved" });
    expect(execute.mock.calls).toEqual([
      [{ type: "appearance.upsertCustomTheme", theme: savedTheme }],
      [{ type: "appearance.setActiveTheme", themeId: savedTheme.id }],
    ]);
    expect(result.current.activeTheme).toBe(newerPreview);
    expect(result.current.resolvedMode).toBe("light");
  });
});
