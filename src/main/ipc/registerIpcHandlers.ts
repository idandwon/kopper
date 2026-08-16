import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { z } from "zod";

import {
  IPC_CHANNELS,
  parseDocumentResult,
} from "../../shared/ipc/contract";
import type { NoteRepository } from "../persistence/noteRepository";

export type IpcMainRegistrar = Pick<IpcMain, "handle" | "removeHandler">;

const GetDocumentArgumentsSchema = z.tuple([]);

function invalidRequest(): ReturnType<typeof parseDocumentResult> {
  return {
    ok: false,
    error: {
      code: "validation_failed",
      message: "The document request was invalid.",
      retryable: false,
    },
  };
}

export function registerIpcHandlers(
  repository: NoteRepository,
  ipcMain: IpcMainRegistrar,
): () => void {
  const getDocument = (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ): ReturnType<typeof parseDocumentResult> => {
    if (!GetDocumentArgumentsSchema.safeParse(args).success) {
      return parseDocumentResult(invalidRequest());
    }

    return parseDocumentResult(repository.currentResult());
  };

  ipcMain.handle(IPC_CHANNELS.getDocument, getDocument);

  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    ipcMain.removeHandler(IPC_CHANNELS.getDocument);
  };
}
