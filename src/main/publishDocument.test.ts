import { describe, expect, it, vi } from "vitest";

import type { KopperDocument } from "../shared/domain/document";
import { IPC_CHANNELS } from "../shared/ipc/contract";
import {
  publishCaptureOutcome,
  publishDocument,
  publishNativeAppearance,
  publishPermissionState,
  type CaptureOutcomePublicationWindow,
  type DocumentPublicationWindow,
  type NativeAppearancePublicationWindow,
  type PermissionPublicationWindow,
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

function captureWindow(windowDestroyed = false, webContentsDestroyed = false) {
  return {
    isDestroyed: vi.fn(() => windowDestroyed),
    webContents: {
      isDestroyed: vi.fn(() => webContentsDestroyed),
      send: vi.fn(),
    },
  } satisfies CaptureOutcomePublicationWindow;
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

function permissionWindow(windowDestroyed = false, webContentsDestroyed = false) {
  return {
    isDestroyed: vi.fn(() => windowDestroyed),
    webContents: {
      isDestroyed: vi.fn(() => webContentsDestroyed),
      send: vi.fn<(channel: string, state: string) => void>(),
    },
  } satisfies PermissionPublicationWindow;
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

  it("publishes only validated permission states to live windows", () => {
    const live = permissionWindow();
    const destroyed = permissionWindow(false, true);
    publishPermissionState([live, destroyed], "denied");
    expect(live.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.accessibilityPermissionChanged,
      "denied",
    );
    expect(destroyed.webContents.send).not.toHaveBeenCalled();
    expect(() => publishPermissionState([live], "authorized")).toThrow();
    expect(live.webContents.send).toHaveBeenCalledTimes(1);
  });

  it("continues document publication after a target throws or is destroyed during send", () => {
    const throwing = publishWindow();
    throwing.webContents.send.mockImplementation(() => {
      throw new Error("destroyed during send");
    });
    const destroyedDuringCheck = publishWindow();
    destroyedDuringCheck.isDestroyed.mockImplementation(() => {
      throw new Error("destroyed during check");
    });
    const later = publishWindow();

    expect(() =>
      publishDocument([throwing, destroyedDuringCheck, later], document),
    ).not.toThrow();
    expect(later.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.documentChanged,
      document,
    );
  });

  it("publishes only validated capture outcomes to every live window", () => {
    const first = captureWindow();
    const second = captureWindow();
    const destroyed = captureWindow(true);
    const outcome = {
      status: "captured",
      noteId: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
    } as const;
    publishCaptureOutcome([first, destroyed, second], outcome);
    for (const live of [first, second]) {
      expect(live.webContents.send).toHaveBeenCalledWith(
        IPC_CHANNELS.captureOutcome,
        outcome,
      );
    }
    expect(destroyed.webContents.send).not.toHaveBeenCalled();
    expect(() =>
      publishCaptureOutcome([first], { status: "captured", noteId: "bad" }),
    ).toThrow();
  });

  it("continues capture publication after a target throws", () => {
    const throwing = captureWindow();
    throwing.webContents.send.mockImplementation(() => {
      throw new Error("destroyed during send");
    });
    const later = captureWindow();
    const outcome = {
      status: "captured",
      noteId: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
    } as const;

    expect(() => publishCaptureOutcome([throwing, later], outcome)).not.toThrow();
    expect(later.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.captureOutcome,
      outcome,
    );
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
