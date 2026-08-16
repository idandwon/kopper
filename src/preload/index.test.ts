import type { IpcRendererEvent } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyDocument } from "../shared/domain/document";
import { OXIDE_LEDGER_THEME } from "../shared/theme/presets";
import type { KopperApi } from "../shared/ipc/contract";
import { IPC_CHANNELS } from "../shared/ipc/contract";

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: electron.removeListener,
  },
}));

await import("./index");

function exposedApi(): KopperApi {
  const call = electron.exposeInMainWorld.mock.calls.find(
    ([key]) => key === "kopper",
  );
  if (call === undefined) throw new Error("Kopper API was not exposed");
  return call[1] as KopperApi;
}

beforeEach(() => {
  electron.invoke.mockReset();
  electron.on.mockReset();
  electron.removeListener.mockReset();
});

describe("preload bridge", () => {
  it("exposes only the typed Kopper API", () => {
    expect(Object.keys(exposedApi()).sort()).toEqual([
      "chooseDataImport",
      "confirmDataImport",
      "continueWithoutCapture",
      "copyNotes",
      "createNewStore",
      "execute",
      "exportData",
      "exportRecoveryBytes",
      "exportTheme",
      "getAccessibilityPermission",
      "getAccessibilitySession",
      "getDataPath",
      "getDocument",
      "getNativeAppearance",
      "importTheme",
      "onAccessibilityPermissionChanged",
      "onCaptureOutcome",
      "onNativeAppearanceChanged",
      "openAccessibilitySettings",
      "openEditorWindow",
      "subscribeDocument",
      "undo",
    ]);
  });

  it("validates getDocument result envelopes", async () => {
    const document = createEmptyDocument(new Date("2026-08-16T12:00:00.000Z"));
    electron.invoke.mockResolvedValueOnce({ ok: true, value: document });

    await expect(exposedApi().getDocument()).resolves.toEqual({
      ok: true,
      value: document,
    });
    expect(electron.invoke).toHaveBeenCalledWith(IPC_CHANNELS.getDocument);

    electron.invoke.mockResolvedValueOnce({ ok: true });
    await expect(exposedApi().getDocument()).rejects.toThrow();
  });

  it("forwards commands and validates command result envelopes", async () => {
    const document = createEmptyDocument(new Date("2026-08-16T12:00:00.000Z"));
    const command = {
      type: "note.add" as const,
      sectionId: document.activeSectionId,
      body: "Captured",
    };
    electron.invoke.mockResolvedValueOnce({ ok: true, value: document });

    await expect(exposedApi().execute(command)).resolves.toEqual({
      ok: true,
      value: document,
    });
    expect(electron.invoke).toHaveBeenCalledWith(
      IPC_CHANNELS.executeCommand,
      command,
    );

    electron.invoke.mockResolvedValueOnce({ ok: true });
    await expect(exposedApi().execute(command)).rejects.toThrow();
  });

  it("invokes undo without arguments and validates its result", async () => {
    const document = createEmptyDocument(new Date("2026-08-16T12:00:00.000Z"));
    electron.invoke.mockResolvedValueOnce({ ok: true, value: document });

    await expect(exposedApi().undo()).resolves.toEqual({
      ok: true,
      value: document,
    });
    expect(electron.invoke).toHaveBeenCalledWith(IPC_CHANNELS.undo);

    electron.invoke.mockResolvedValueOnce({ ok: false });
    await expect(exposedApi().undo()).rejects.toThrow();
  });

  it("validates copy arguments and result envelopes", async () => {
    electron.invoke.mockResolvedValueOnce({
      ok: true,
      value: { copiedCount: 2 },
    });

    await expect(
      exposedApi().copyNotes(["second", "first"], "markdown-list"),
    ).resolves.toEqual({ ok: true, value: { copiedCount: 2 } });
    expect(electron.invoke).toHaveBeenCalledWith(
      IPC_CHANNELS.copyNotes,
      ["second", "first"],
      "markdown-list",
    );

    await expect(exposedApi().copyNotes([], "plain")).rejects.toThrow();
    electron.invoke.mockResolvedValueOnce({ ok: true });
    await expect(exposedApi().copyNotes(["first"], "plain")).rejects.toThrow();
  });

  it("validates editor and data-file payloads in both directions", async () => {
    const document = createEmptyDocument(new Date("2026-08-16T12:00:00.000Z"));
    electron.invoke
      .mockResolvedValueOnce({ ok: true, value: { noteId: "note-1" } })
      .mockResolvedValueOnce({ ok: true, value: { cancelled: true } })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          token: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
          fileName: "notes.json",
          noteCount: 0,
          sectionCount: 1,
        },
      })
      .mockResolvedValueOnce({ ok: true, value: document })
      .mockResolvedValueOnce({ ok: true, value: { cancelled: true } })
      .mockResolvedValueOnce({ ok: true, value: document })
      .mockResolvedValueOnce({ ok: true, value: "/tmp/kopper.json" });

    await expect(
      exposedApi().openEditorWindow("note-1"),
    ).resolves.toMatchObject({ ok: true });
    await expect(exposedApi().exportData()).resolves.toMatchObject({
      ok: true,
    });
    const preview = await exposedApi().chooseDataImport();
    expect(preview).toMatchObject({
      ok: true,
      value: { fileName: "notes.json" },
    });
    await expect(
      exposedApi().confirmDataImport("0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5"),
    ).resolves.toMatchObject({ ok: true });
    await expect(exposedApi().exportRecoveryBytes()).resolves.toMatchObject({
      ok: true,
    });
    await expect(exposedApi().createNewStore()).resolves.toMatchObject({
      ok: true,
    });
    await expect(exposedApi().getDataPath()).resolves.toEqual({
      ok: true,
      value: "/tmp/kopper.json",
    });

    await expect(exposedApi().openEditorWindow("")).rejects.toThrow();
    electron.invoke.mockResolvedValueOnce({
      ok: true,
      value: { cancelled: "yes" },
    });
    await expect(exposedApi().exportData()).rejects.toThrow();
  });

  it("validates theme and native-appearance IPC in both directions", async () => {
    const customTheme = {
      ...structuredClone(OXIDE_LEDGER_THEME),
      id: "custom:preview",
    };
    const readabilityError = {
      code: "validation_failed" as const,
      message: "Theme readability validation found 1 problem.",
      retryable: false,
      failures: [
        {
          mode: "light" as const,
          backgroundToken: "background" as const,
          foregroundToken: "foreground" as const,
          ratio: 1,
        },
      ],
      opaqueBackgroundModes: [],
    };
    const importPreview = {
      theme: customTheme,
      derivedTokens: { light: ["capture"], dark: [] },
    };
    electron.invoke
      .mockResolvedValueOnce({ ok: true, value: importPreview })
      .mockResolvedValueOnce({
        ok: true,
        value: { path: "/private/theme.kopper-theme.json" },
      })
      .mockResolvedValueOnce({ ok: true, value: false })
      .mockResolvedValueOnce({ ok: false, error: readabilityError })
      .mockResolvedValueOnce({ ok: false, error: readabilityError });

    await expect(exposedApi().importTheme()).resolves.toEqual({
      ok: true,
      value: importPreview,
    });
    await expect(exposedApi().exportTheme(customTheme.id)).resolves.toEqual({
      ok: true,
      value: { path: "/private/theme.kopper-theme.json" },
    });
    await expect(exposedApi().getNativeAppearance()).resolves.toEqual({
      ok: true,
      value: false,
    });
    await expect(exposedApi().importTheme()).resolves.toEqual({
      ok: false,
      error: readabilityError,
    });
    const unreadableTheme = structuredClone(customTheme);
    unreadableTheme.light.foreground = unreadableTheme.light.background;
    await expect(
      exposedApi().execute({
        type: "appearance.upsertCustomTheme",
        theme: unreadableTheme,
      }),
    ).resolves.toEqual({ ok: false, error: readabilityError });
    expect(electron.invoke.mock.calls.slice(0, 5)).toEqual([
      [IPC_CHANNELS.importTheme],
      [IPC_CHANNELS.exportTheme, customTheme.id],
      [IPC_CHANNELS.getNativeAppearance],
      [IPC_CHANNELS.importTheme],
      [
        IPC_CHANNELS.executeCommand,
        { type: "appearance.upsertCustomTheme", theme: unreadableTheme },
      ],
    ]);

    await expect(exposedApi().exportTheme("")).rejects.toThrow();
    electron.invoke.mockResolvedValueOnce({ ok: true, value: {} });
    await expect(exposedApi().importTheme()).rejects.toThrow();
    electron.invoke.mockResolvedValueOnce({ ok: true, value: "dark" });
    await expect(exposedApi().getNativeAppearance()).rejects.toThrow();
    electron.invoke.mockResolvedValueOnce({
      ok: false,
      error: {
        ...readabilityError,
        failures: [{ ...readabilityError.failures[0], mode: "system" }],
      },
    });
    await expect(exposedApi().importTheme()).rejects.toThrow();
  });

  it("validates permission IPC in both directions", async () => {
    electron.invoke
      .mockResolvedValueOnce({ ok: true, value: "unknown" })
      .mockResolvedValueOnce({ ok: true, value: "denied" })
      .mockResolvedValueOnce({
        ok: true,
        value: { continuedWithoutCapture: false },
      })
      .mockResolvedValueOnce({ ok: true, value: { acknowledged: true } })
      .mockResolvedValueOnce({ ok: true, value: { acknowledged: true } });

    await expect(
      exposedApi().getAccessibilityPermission(false),
    ).resolves.toEqual({ ok: true, value: "unknown" });
    await expect(
      exposedApi().getAccessibilityPermission(true),
    ).resolves.toEqual({ ok: true, value: "denied" });
    await expect(exposedApi().getAccessibilitySession()).resolves.toEqual({
      ok: true,
      value: { continuedWithoutCapture: false },
    });
    await expect(exposedApi().openAccessibilitySettings()).resolves.toEqual({
      ok: true,
      value: { acknowledged: true },
    });
    await expect(exposedApi().continueWithoutCapture()).resolves.toEqual({
      ok: true,
      value: { acknowledged: true },
    });
    expect(electron.invoke.mock.calls).toEqual([
      [IPC_CHANNELS.getAccessibilityPermission, false],
      [IPC_CHANNELS.getAccessibilityPermission, true],
      [IPC_CHANNELS.getAccessibilitySession],
      [IPC_CHANNELS.openAccessibilitySettings],
      [IPC_CHANNELS.continueWithoutCapture],
    ]);

    await expect(
      exposedApi().getAccessibilityPermission("yes" as unknown as boolean),
    ).rejects.toThrow();
    electron.invoke.mockResolvedValueOnce({ ok: true, value: "authorized" });
    await expect(
      exposedApi().getAccessibilityPermission(false),
    ).rejects.toThrow();
    electron.invoke.mockResolvedValueOnce({ ok: true, value: {} });
    await expect(exposedApi().getAccessibilitySession()).rejects.toThrow();
    electron.invoke.mockResolvedValueOnce({ ok: true, value: {} });
    await expect(exposedApi().openAccessibilitySettings()).rejects.toThrow();
  });

  it("validates permission events and unsubscribes exactly its listener", () => {
    const listener = vi.fn();
    const unsubscribe = exposedApi().onAccessibilityPermissionChanged(listener);
    const subscription = electron.on.mock.calls[0];
    expect(subscription?.[0]).toBe(IPC_CHANNELS.accessibilityPermissionChanged);
    const wrappedListener = subscription?.[1] as (
      event: IpcRendererEvent,
      input: unknown,
    ) => void;

    wrappedListener({} as IpcRendererEvent, "granted");
    expect(listener).toHaveBeenCalledWith("granted");
    expect(() =>
      wrappedListener({} as IpcRendererEvent, "authorized"),
    ).toThrow();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    unsubscribe();
    expect(electron.removeListener).toHaveBeenCalledExactlyOnceWith(
      IPC_CHANNELS.accessibilityPermissionChanged,
      wrappedListener,
    );
  });

  it("validates capture outcomes and unsubscribes exactly its listener", () => {
    const listener = vi.fn();
    const unsubscribe = exposedApi().onCaptureOutcome(listener);
    const subscription = electron.on.mock.calls[0];
    expect(subscription?.[0]).toBe(IPC_CHANNELS.captureOutcome);
    const wrappedListener = subscription?.[1] as (
      event: IpcRendererEvent,
      input: unknown,
    ) => void;
    const outcome = {
      status: "captured",
      noteId: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
    } as const;

    wrappedListener({} as IpcRendererEvent, outcome);
    expect(listener).toHaveBeenCalledWith(outcome);
    expect(() =>
      wrappedListener({} as IpcRendererEvent, {
        status: "captured",
        noteId: "not-a-uuid",
      }),
    ).toThrow();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    unsubscribe();
    expect(electron.removeListener).toHaveBeenCalledExactlyOnceWith(
      IPC_CHANNELS.captureOutcome,
      wrappedListener,
    );
  });

  it("validates native appearance events and unsubscribes exactly its listener", () => {
    const listener = vi.fn();
    const unsubscribe = exposedApi().onNativeAppearanceChanged(listener);
    const subscription = electron.on.mock.calls[0];
    expect(subscription?.[0]).toBe(IPC_CHANNELS.nativeAppearanceChanged);
    const wrappedListener = subscription?.[1] as (
      event: IpcRendererEvent,
      input: unknown,
    ) => void;

    wrappedListener({} as IpcRendererEvent, true);
    expect(listener).toHaveBeenCalledWith(true);
    expect(() => wrappedListener({} as IpcRendererEvent, "dark")).toThrow();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    unsubscribe();
    expect(electron.removeListener).toHaveBeenCalledTimes(1);
    expect(electron.removeListener).toHaveBeenCalledWith(
      IPC_CHANNELS.nativeAppearanceChanged,
      wrappedListener,
    );
  });

  it("validates document events before notifying subscribers", () => {
    const document = createEmptyDocument(new Date("2026-08-16T12:00:00.000Z"));
    const listener = vi.fn();
    exposedApi().subscribeDocument(listener);
    const subscription = electron.on.mock.calls[0];
    expect(subscription?.[0]).toBe(IPC_CHANNELS.documentChanged);
    const wrappedListener = subscription?.[1] as (
      event: IpcRendererEvent,
      input: unknown,
    ) => void;

    wrappedListener({} as IpcRendererEvent, document);
    expect(listener).toHaveBeenCalledWith(document);
    expect(() => wrappedListener({} as IpcRendererEvent, {})).toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes exactly the listener it registered", () => {
    const unsubscribe = exposedApi().subscribeDocument(vi.fn());
    const wrappedListener = electron.on.mock.calls[0]?.[1];

    unsubscribe();
    unsubscribe();

    expect(electron.removeListener).toHaveBeenCalledTimes(1);
    expect(electron.removeListener).toHaveBeenCalledWith(
      IPC_CHANNELS.documentChanged,
      wrappedListener,
    );
  });
});
