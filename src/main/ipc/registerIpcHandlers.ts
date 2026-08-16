import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { z } from "zod";

import type { KopperDocument } from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import {
  IPC_CHANNELS,
  parseDocumentResult,
} from "../../shared/ipc/contract";
import type {
  NoteRepository,
  RepositoryLoadResult,
} from "../persistence/noteRepository";

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

function getDocumentResult(
  repository: NoteRepository,
  initialLoadResult: RepositoryLoadResult,
): Result<KopperDocument, KopperError> {
  if (!initialLoadResult.ok) {
    return { ok: false, error: structuredClone(initialLoadResult.error) };
  }

  return { ok: true, value: repository.snapshot() };
}

export function registerIpcHandlers(
  repository: NoteRepository,
  ipcMain: IpcMainRegistrar,
  initialLoadResult: RepositoryLoadResult,
): () => void {
  const getDocument = (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ): ReturnType<typeof parseDocumentResult> => {
    if (!GetDocumentArgumentsSchema.safeParse(args).success) {
      return parseDocumentResult(invalidRequest());
    }

    return parseDocumentResult(getDocumentResult(repository, initialLoadResult));
  };

  ipcMain.handle(IPC_CHANNELS.getDocument, getDocument);

  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    ipcMain.removeHandler(IPC_CHANNELS.getDocument);
  };
}
