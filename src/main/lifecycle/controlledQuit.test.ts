import { describe, expect, it, vi } from "vitest";

import { ControlledQuit } from "./controlledQuit";

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("ControlledQuit", () => {
  it("prevents the first quit and waits for deferred persistence and cleanup", async () => {
    const persistence = deferred();
    const disposeCaptureRuntime = vi.fn(async () => undefined);
    const disposeShortcutManager = vi.fn(async () => undefined);
    const finishQuit = vi.fn();
    const controller = new ControlledQuit({
      flushBounds: () => persistence.promise,
      disposeCaptureRuntime,
      disposeShortcutManager,
      finishQuit,
    });
    const firstPreventDefault = vi.fn();

    controller.handleBeforeQuit({ preventDefault: firstPreventDefault });
    await Promise.resolve();

    expect(firstPreventDefault).toHaveBeenCalledOnce();
    expect(finishQuit).not.toHaveBeenCalled();
    expect(disposeCaptureRuntime).not.toHaveBeenCalled();

    persistence.resolve();
    await vi.waitFor(() => expect(finishQuit).toHaveBeenCalledOnce());
    expect(disposeCaptureRuntime).toHaveBeenCalledOnce();
    expect(disposeShortcutManager).toHaveBeenCalledOnce();

    const secondPreventDefault = vi.fn();
    controller.handleBeforeQuit({ preventDefault: secondPreventDefault });
    expect(secondPreventDefault).not.toHaveBeenCalled();
    expect(finishQuit).toHaveBeenCalledOnce();
  });

  it("still completes exactly one final quit when persistence and cleanup fail", async () => {
    const finishQuit = vi.fn();
    const controller = new ControlledQuit({
      flushBounds: async () => {
        throw new Error("private persistence detail");
      },
      disposeCaptureRuntime: async () => {
        throw new Error("private runtime detail");
      },
      disposeShortcutManager: async () => {
        throw new Error("private shortcut detail");
      },
      finishQuit,
    });
    const preventDefault = vi.fn();

    controller.handleBeforeQuit({ preventDefault });
    controller.handleBeforeQuit({ preventDefault });

    await vi.waitFor(() => expect(finishQuit).toHaveBeenCalledOnce());
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(finishQuit).toHaveBeenCalledOnce();
  });
});
