import type { IpcMainInvokeEvent } from "electron";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { DocumentCommand } from "../../shared/domain/commands";
import { createEmptyDocument } from "../../shared/domain/document";
import { IPC_CHANNELS, parseDocumentResult } from "../../shared/ipc/contract";
import { NoteRepository } from "../persistence/noteRepository";
import {
  registerIpcHandlers,
  type CommandExecutor,
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

const temporaryDirectories: string[] = [];

function makeCommandExecutor(): CommandExecutor & {
  execute: ReturnType<typeof vi.fn<CommandExecutor["execute"]>>;
  undo: ReturnType<typeof vi.fn<CommandExecutor["undo"]>>;
} {
  return {
    execute: vi.fn<CommandExecutor["execute"]>(),
    undo: vi.fn<CommandExecutor["undo"]>(),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("registerIpcHandlers", () => {
  it("returns cloned snapshots after a successful initial load", async () => {
    const repository = new NoteRepository("unused.json");
    const ipcMain = new FakeIpcMain();
    registerIpcHandlers(repository, makeCommandExecutor(), ipcMain);

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

  it("observes malformed-load recovery without handler re-registration", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kopper-ipc-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "kopper.json");
    await writeFile(path, "{broken", "utf8");
    const repository = new NoteRepository(path);
    const failedLoad = await repository.load();
    expect(failedLoad.ok).toBe(false);
    if (failedLoad.ok) return;

    const ipcMain = new FakeIpcMain();
    registerIpcHandlers(repository, makeCommandExecutor(), ipcMain);

    expect(
      parseDocumentResult(await ipcMain.invoke(IPC_CHANNELS.getDocument)),
    ).toEqual({ ok: false, error: failedLoad.error });

    const recovered = createEmptyDocument(
      new Date("2026-08-16T12:00:00.000Z"),
    );
    await expect(repository.replace(recovered)).resolves.toEqual({
      ok: true,
      value: recovered,
    });
    expect(
      parseDocumentResult(await ipcMain.invoke(IPC_CHANNELS.getDocument)),
    ).toEqual({ ok: true, value: recovered });
    expect([...ipcMain.handlers.keys()]).toEqual([
      IPC_CHANNELS.getDocument,
      IPC_CHANNELS.executeCommand,
      IPC_CHANNELS.undo,
    ]);
  });

  it("returns a structured validation error for unexpected handler input", async () => {
    const repository = new NoteRepository("unused.json");
    const ipcMain = new FakeIpcMain();
    registerIpcHandlers(repository, makeCommandExecutor(), ipcMain);

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

  it("runtime-parses commands before dispatching them", async () => {
    const repository = new NoteRepository("unused.json");
    const commandExecutor = makeCommandExecutor();
    const document = repository.snapshot();
    commandExecutor.execute.mockResolvedValue({ ok: true, value: document });
    const ipcMain = new FakeIpcMain();
    registerIpcHandlers(repository, commandExecutor, ipcMain);
    const command: DocumentCommand = {
      type: "note.add",
      sectionId: document.activeSectionId,
      body: "Captured",
    };

    await expect(
      ipcMain.invoke(IPC_CHANNELS.executeCommand, command),
    ).resolves.toEqual({ ok: true, value: document });
    expect(commandExecutor.execute).toHaveBeenCalledWith(command);

    for (const args of [
      [],
      [{ ...command, unexpected: true }],
      [command, "extra"],
    ]) {
      await expect(
        ipcMain.invoke(IPC_CHANNELS.executeCommand, ...args),
      ).resolves.toEqual({
        ok: false,
        error: {
          code: "validation_failed",
          message: "The document command was invalid.",
          retryable: false,
        },
      });
    }
    expect(commandExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it("dispatches argument-free undo and rejects malformed undo requests", async () => {
    const repository = new NoteRepository("unused.json");
    const commandExecutor = makeCommandExecutor();
    const emptyUndoError = {
      code: "validation_failed" as const,
      message: "There is no document action to undo.",
      retryable: false,
    };
    commandExecutor.undo.mockResolvedValue({ ok: false, error: emptyUndoError });
    const ipcMain = new FakeIpcMain();
    registerIpcHandlers(repository, commandExecutor, ipcMain);

    await expect(ipcMain.invoke(IPC_CHANNELS.undo)).resolves.toEqual({
      ok: false,
      error: emptyUndoError,
    });
    expect(commandExecutor.undo).toHaveBeenCalledTimes(1);

    await expect(
      ipcMain.invoke(IPC_CHANNELS.undo, "unexpected"),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "validation_failed",
        message: "The undo request was invalid.",
        retryable: false,
      },
    });
    expect(commandExecutor.undo).toHaveBeenCalledTimes(1);
  });

  it("removes only registered handlers and can register again after cleanup", () => {
    const repository = new NoteRepository("unused.json");
    const ipcMain = new FakeIpcMain();
    const cleanup = registerIpcHandlers(
      repository,
      makeCommandExecutor(),
      ipcMain,
    );

    expect([...ipcMain.handlers.keys()]).toEqual([
      IPC_CHANNELS.getDocument,
      IPC_CHANNELS.executeCommand,
      IPC_CHANNELS.undo,
    ]);
    cleanup();
    cleanup();
    expect(ipcMain.removedChannels).toEqual([
      IPC_CHANNELS.getDocument,
      IPC_CHANNELS.executeCommand,
      IPC_CHANNELS.undo,
    ]);

    expect(() =>
      registerIpcHandlers(repository, makeCommandExecutor(), ipcMain),
    ).not.toThrow();
  });

  it("returns runtime-valid envelopes", async () => {
    const repository = new NoteRepository("unused.json");
    const ipcMain = new FakeIpcMain();
    registerIpcHandlers(repository, makeCommandExecutor(), ipcMain);

    const result = await ipcMain.invoke(IPC_CHANNELS.getDocument);
    expect(() => parseDocumentResult(result)).not.toThrow();
  });
});
