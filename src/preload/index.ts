import { contextBridge, ipcRenderer } from "electron";

import { KopperDocumentSchema } from "../shared/domain/document";
import {
  IPC_CHANNELS,
  parseDocumentResult,
  type KopperApi,
} from "../shared/ipc/contract";

const api: KopperApi = {
  async getDocument() {
    return parseDocumentResult(
      await ipcRenderer.invoke(IPC_CHANNELS.getDocument),
    );
  },

  subscribeDocument(listener) {
    const wrappedListener = (_event: Electron.IpcRendererEvent, input: unknown) => {
      listener(KopperDocumentSchema.parse(input));
    };

    ipcRenderer.on(IPC_CHANNELS.documentChanged, wrappedListener);

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      ipcRenderer.removeListener(
        IPC_CHANNELS.documentChanged,
        wrappedListener,
      );
    };
  },
};

contextBridge.exposeInMainWorld("kopper", api);
