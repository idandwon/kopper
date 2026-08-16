import type { KopperDocument } from "../shared/domain/document";
import {
  IPC_CHANNELS,
  NativeAppearanceSchema,
} from "../shared/ipc/contract";

interface PublicationWindow<Payload> {
  isDestroyed(): boolean;
  webContents: {
    isDestroyed(): boolean;
    send(channel: string, payload: Payload): void;
  };
}

export type DocumentPublicationWindow = PublicationWindow<KopperDocument>;
export type NativeAppearancePublicationWindow = PublicationWindow<boolean>;

export function publishDocument(
  windows: DocumentPublicationWindow[],
  document: KopperDocument,
): void {
  for (const window of windows) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
    window.webContents.send(IPC_CHANNELS.documentChanged, document);
  }
}

export function publishNativeAppearance(
  windows: NativeAppearancePublicationWindow[],
  input: unknown,
): void {
  const useDarkColors = NativeAppearanceSchema.parse(input);
  for (const window of windows) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
    window.webContents.send(
      IPC_CHANNELS.nativeAppearanceChanged,
      useDarkColors,
    );
  }
}
