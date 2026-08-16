import { contextBridge, ipcRenderer } from "electron";

import { KopperDocumentSchema } from "../shared/domain/document";
import {
  CopyNotesArgumentsSchema,
  IPC_CHANNELS,
  parseClipboardCopyResult,
  parseDocumentResult,
  type KopperApi,
} from "../shared/ipc/contract";

const api: KopperApi = {
  async getDocument() {
    return parseDocumentResult(
      await ipcRenderer.invoke(IPC_CHANNELS.getDocument),
    );
  },

  async execute(command) {
    return parseDocumentResult(
      await ipcRenderer.invoke(IPC_CHANNELS.executeCommand, command),
    );
  },

  async undo() {
    return parseDocumentResult(await ipcRenderer.invoke(IPC_CHANNELS.undo));
  },

  async copyNotes(noteIds, mode) {
    const [parsedIds, parsedMode] = CopyNotesArgumentsSchema.parse([
      noteIds,
      mode,
    ]);
    return parseClipboardCopyResult(
      await ipcRenderer.invoke(IPC_CHANNELS.copyNotes, parsedIds, parsedMode),
    );
  },

  subscribeDocument(listener) {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      input: unknown,
    ) => {
      listener(KopperDocumentSchema.parse(input));
    };

    ipcRenderer.on(IPC_CHANNELS.documentChanged, wrappedListener);

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      ipcRenderer.removeListener(IPC_CHANNELS.documentChanged, wrappedListener);
    };
  },
};

contextBridge.exposeInMainWorld("kopper", api);
