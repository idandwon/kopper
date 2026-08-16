import { describe, expect, it, vi } from "vitest";

import type { KopperDocument } from "../shared/domain/document";
import { IPC_CHANNELS } from "../shared/ipc/contract";
import {
  publishDocument,
  type DocumentPublicationWindow,
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
});
