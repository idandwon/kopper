import type { KopperDocument } from "../shared/domain/document";
import {
  PermissionStateSchema,
  type PermissionState,
} from "../shared/permissions/permissionState";
import {
  CaptureOutcomeSchema,
  IPC_CHANNELS,
  NativeAppearanceSchema,
  type CaptureOutcome,
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
export type PermissionPublicationWindow = PublicationWindow<PermissionState>;
export type CaptureOutcomePublicationWindow = PublicationWindow<CaptureOutcome>;

export function publishDocument(
  windows: DocumentPublicationWindow[],
  document: KopperDocument,
): void {
  for (const window of windows) {
    try {
      if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
      window.webContents.send(IPC_CHANNELS.documentChanged, document);
    } catch {
      // A window may be destroyed between the lifecycle check and send.
    }
  }
}

export function publishPermissionState(
  windows: PermissionPublicationWindow[],
  input: unknown,
): void {
  const state = PermissionStateSchema.parse(input);
  for (const window of windows) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
    window.webContents.send(IPC_CHANNELS.accessibilityPermissionChanged, state);
  }
}

export function publishCaptureOutcome(
  windows: CaptureOutcomePublicationWindow[],
  input: unknown,
): void {
  const outcome = CaptureOutcomeSchema.parse(input);
  for (const window of windows) {
    try {
      if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
      window.webContents.send(IPC_CHANNELS.captureOutcome, outcome);
    } catch {
      // Continue to other windows after a destruction race or send failure.
    }
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
