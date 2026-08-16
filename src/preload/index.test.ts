import type { IpcRendererEvent } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyDocument } from "../shared/domain/document";
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
      "copyNotes",
      "execute",
      "getDocument",
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
