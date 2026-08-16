import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { z } from "zod";

import {
  DocumentCommandSchema,
  type DocumentCommand,
} from "../../shared/domain/commands";
import type { KopperDocument } from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import {
  IPC_CHANNELS,
  parseDocumentResult,
} from "../../shared/ipc/contract";
import type { NoteRepository } from "../persistence/noteRepository";

export type IpcMainRegistrar = Pick<IpcMain, "handle" | "removeHandler">;

export interface CommandExecutor {
  execute(
    command: DocumentCommand,
  ): Promise<Result<KopperDocument, KopperError>>;
  undo(): Promise<Result<KopperDocument, KopperError>>;
}

const NoArgumentsSchema = z.tuple([]);

function invalidRequest(message: string): ReturnType<typeof parseDocumentResult> {
  return {
    ok: false,
    error: {
      code: "validation_failed",
      message,
      retryable: false,
    },
  };
}

export function registerIpcHandlers(
  repository: NoteRepository,
  commandExecutor: CommandExecutor,
  ipcMain: IpcMainRegistrar,
): () => void {
  const getDocument = (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ): ReturnType<typeof parseDocumentResult> => {
    if (!NoArgumentsSchema.safeParse(args).success) {
      return parseDocumentResult(
        invalidRequest("The document request was invalid."),
      );
    }

    return parseDocumentResult(repository.currentResult());
  };

  const executeCommand = async (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ): Promise<ReturnType<typeof parseDocumentResult>> => {
    if (args.length !== 1) {
      return parseDocumentResult(
        invalidRequest("The document command was invalid."),
      );
    }
    const parsedCommand = DocumentCommandSchema.safeParse(args[0]);
    if (!parsedCommand.success) {
      return parseDocumentResult(
        invalidRequest("The document command was invalid."),
      );
    }

    return parseDocumentResult(
      await commandExecutor.execute(parsedCommand.data),
    );
  };

  const undo = async (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ): Promise<ReturnType<typeof parseDocumentResult>> => {
    if (!NoArgumentsSchema.safeParse(args).success) {
      return parseDocumentResult(
        invalidRequest("The undo request was invalid."),
      );
    }

    return parseDocumentResult(await commandExecutor.undo());
  };

  const channels = [
    [IPC_CHANNELS.getDocument, getDocument],
    [IPC_CHANNELS.executeCommand, executeCommand],
    [IPC_CHANNELS.undo, undo],
  ] as const;
  for (const [channel, handler] of channels) {
    ipcMain.handle(channel, handler);
  }

  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    for (const [channel] of channels) {
      ipcMain.removeHandler(channel);
    }
  };
}
