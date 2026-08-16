import type { KopperDocument } from "../shared/domain/document";
import { IPC_CHANNELS } from "../shared/ipc/contract";

export interface DocumentPublicationWindow {
  isDestroyed(): boolean;
  webContents: {
    isDestroyed(): boolean;
    send(channel: string, document: KopperDocument): void;
  };
}

export function publishDocument(
  windows: DocumentPublicationWindow[],
  document: KopperDocument,
): void {
  for (const window of windows) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
    window.webContents.send(IPC_CHANNELS.documentChanged, document);
  }
}
