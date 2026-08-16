import { describe, expect, it, vi } from "vitest";

import type { KopperDocument } from "../shared/domain/document";
import { IPC_CHANNELS } from "../shared/ipc/contract";
import {
  publishDocument,
  publishNativeAppearance,
  type DocumentPublicationWindow,
  type NativeAppearancePublicationWindow,
} from "./publishDocument";

const document = { schemaVersion: 1 } as KopperDocument;

function publishWindow(windowDestroyed = false, webContentsDestroyed = false) {
  return {
    isDestroyed: vi.fn(() => windowDestroyed),
    webContents: {
      isDestroyed: vi.fn(() => webContentsDestroyed),
      send: vi.fn<
        (channel: string, publishedDocument: KopperDocument) => void
      >(),
    },
  } satisfies DocumentPublicationWindow;
}

function appearanceWindow(windowDestroyed = false, webContentsDestroyed = false) {
  return {
    isDestroyed: vi.fn(() => windowDestroyed),
    webContents: {
      isDestroyed: vi.fn(() => webContentsDestroyed),
      send: vi.fn<(channel: string, useDarkColors: boolean) => void>(),
    },
  } satisfies NativeAppearancePublicationWindow;
}

describe("publishDocument", () => {
  it("sends exactly one document event to every current live window and skips destroyed targets", () => {
    const first = publishWindow();
    const second = publishWindow();
    const third = publishWindow();
    const destroyedWindow = publishWindow(true);
    const destroyedWebContents = publishWindow(false, true);

    publishDocument(
      [first, destroyedWindow, second, destroyedWebContents, third],
      document,
    );

    for (const liveWindow of [first, second, third]) {
      expect(liveWindow.webContents.send).toHaveBeenCalledOnce();
      expect(liveWindow.webContents.send).toHaveBeenCalledWith(
        IPC_CHANNELS.documentChanged,
        document,
      );
    }
    expect(destroyedWindow.webContents.send).not.toHaveBeenCalled();
    expect(destroyedWebContents.webContents.send).not.toHaveBeenCalled();
  });

  it("publishes only validated native appearance booleans to live windows", () => {
    const live = appearanceWindow();
    const destroyed = appearanceWindow(true);
    publishNativeAppearance([live, destroyed], true);
    expect(live.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.nativeAppearanceChanged,
      true,
    );
    expect(destroyed.webContents.send).not.toHaveBeenCalled();
    expect(() => publishNativeAppearance([live], "dark")).toThrow();
    expect(live.webContents.send).toHaveBeenCalledTimes(1);
  });
});
