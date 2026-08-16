import type { IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import { IPC_CHANNELS, parseDocumentResult } from "../../shared/ipc/contract";
import {
  NoteRepository,
  type RepositoryLoadResult,
} from "../persistence/noteRepository";
import {
  registerIpcHandlers,
  type IpcMainRegistrar,
} from "./registerIpcHandlers";

type Handler = (
  event: IpcMainInvokeEvent,
  ...args: unknown[]
) => unknown | Promise<unknown>;

class FakeIpcMain implements IpcMainRegistrar {
  readonly handlers = new Map<string, Handler>();
  readonly removedChannels: string[] = [];

  handle(channel: string, listener: Handler): void {
    if (this.handlers.has(channel)) {
      throw new Error(`Duplicate handler for ${channel}`);
    }
    this.handlers.set(channel, listener);
  }

  removeHandler(channel: string): void {
    this.removedChannels.push(channel);
    this.handlers.delete(channel);
  }

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (handler === undefined)
      throw new Error(`Missing handler for ${channel}`);
    return handler({} as IpcMainInvokeEvent, ...args);
  }
}

function successfulLoad(repository: NoteRepository): RepositoryLoadResult {
  return { ok: true, value: repository.snapshot(), created: false };
}

describe("registerIpcHandlers", () => {
  it("returns cloned snapshots after a successful initial load", async () => {
    const repository = new NoteRepository("unused.json");
    const ipcMain = new FakeIpcMain();
    registerIpcHandlers(repository, ipcMain, successfulLoad(repository));

    const first = parseDocumentResult(
      await ipcMain.invoke(IPC_CHANNELS.getDocument),
    );
    expect(first).toEqual({ ok: true, value: repository.snapshot() });
    if (!first.ok) return;
    first.value.sections[0].title = "Changed outside";

    const second = parseDocumentResult(
      await ipcMain.invoke(IPC_CHANNELS.getDocument),
    );
    expect(second.ok && second.value.sections[0].title).toBe("Inbox");
  });

  it("preserves a structured initial load error without exposing a snapshot", async () => {
    const repository = new NoteRepository("unused.json");
    const snapshot = vi.spyOn(repository, "snapshot");
    const ipcMain = new FakeIpcMain();
    const initialLoadResult: RepositoryLoadResult = {
      ok: false,
      error: {
        code: "invalid_document",
        message: "The Kopper document is not valid JSON.",
        retryable: false,
        recoveryAction: "choose_file",
      },
      raw: Buffer.from("{broken"),
    };
    registerIpcHandlers(repository, ipcMain, initialLoadResult);

    expect(
      parseDocumentResult(await ipcMain.invoke(IPC_CHANNELS.getDocument)),
    ).toEqual({ ok: false, error: initialLoadResult.error });
    expect(snapshot).not.toHaveBeenCalled();
  });

  it("returns a structured validation error for unexpected handler input", async () => {
    const repository = new NoteRepository("unused.json");
    const ipcMain = new FakeIpcMain();
    registerIpcHandlers(repository, ipcMain, successfulLoad(repository));

    expect(
      parseDocumentResult(
        await ipcMain.invoke(IPC_CHANNELS.getDocument, "unexpected"),
      ),
    ).toEqual({
      ok: false,
      error: {
        code: "validation_failed",
        message: "The document request was invalid.",
        retryable: false,
      },
    });
  });

  it("removes only registered handlers and can register again after cleanup", () => {
    const repository = new NoteRepository("unused.json");
    const ipcMain = new FakeIpcMain();
    const cleanup = registerIpcHandlers(
      repository,
      ipcMain,
      successfulLoad(repository),
    );

    expect([...ipcMain.handlers.keys()]).toEqual([IPC_CHANNELS.getDocument]);
    cleanup();
    cleanup();
    expect(ipcMain.removedChannels).toEqual([IPC_CHANNELS.getDocument]);

    expect(() =>
      registerIpcHandlers(repository, ipcMain, successfulLoad(repository)),
    ).not.toThrow();
  });

  it("returns runtime-valid envelopes", async () => {
    const repository = new NoteRepository("unused.json");
    const ipcMain = new FakeIpcMain();
    registerIpcHandlers(repository, ipcMain, successfulLoad(repository));

    const result = await ipcMain.invoke(IPC_CHANNELS.getDocument);
    expect(() => parseDocumentResult(result)).not.toThrow();
  });
});
