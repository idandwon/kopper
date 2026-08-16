import { describe, expect, it, vi } from "vitest";

import type { KopperDocument } from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import type { CaptureOutcome } from "../../shared/ipc/contract";
import { CaptureCoordinator } from "./captureCoordinator";

const timeout: KopperError = {
  code: "capture_timeout",
  message: "Kopper timed out while capturing the selected text.",
  retryable: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function makeCoordinator(overrides: {
  capture?: () => Promise<Result<string, KopperError>>;
  execute?: (command: never) => Promise<Result<KopperDocument, KopperError>>;
  activeSectionId?: () => string;
  createId?: () => string;
  publish?: (outcome: CaptureOutcome) => void;
} = {}) {
  const defaultCapture = async (): Promise<Result<string, KopperError>> => ({
    ok: true,
    value: "exact text",
  });
  const defaultExecute = async (): Promise<Result<KopperDocument, KopperError>> => ({
    ok: true,
    value: {} as KopperDocument,
  });
  const capture = vi.fn(overrides.capture ?? defaultCapture);
  const execute = vi.fn(overrides.execute ?? defaultExecute);
  const activeSectionId = vi.fn(overrides.activeSectionId ?? (() => "inbox"));
  const createId = vi.fn(overrides.createId ?? (() => "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5"));
  const publish = vi.fn(overrides.publish ?? (() => undefined));
  return {
    coordinator: new CaptureCoordinator(
      { capture },
      { execute },
      { activeSectionId },
      { createId, publish },
    ),
    capture,
    execute,
    activeSectionId,
    createId,
    publish,
  };
}

describe("CaptureCoordinator", () => {
  it("strictly serializes capture restoration through persistence and outcome publication", async () => {
    const firstCapture = deferred<Result<string, KopperError>>();
    const firstWrite = deferred<Result<KopperDocument, KopperError>>();
    const captures = [firstCapture.promise, Promise.resolve({ ok: true as const, value: "second" })];
    const writes = [firstWrite.promise, Promise.resolve({ ok: true as const, value: {} as KopperDocument })];
    const { coordinator, capture, execute, publish } = makeCoordinator({
      capture: () => captures.shift()!,
      execute: () => writes.shift()!,
    });

    const first = coordinator.requestCapture();
    const second = coordinator.requestCapture();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(1));
    firstCapture.resolve({ ok: true, value: "first" });
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(capture).toHaveBeenCalledTimes(1);
    firstWrite.resolve({ ok: true, value: {} as KopperDocument });
    await expect(first).resolves.toMatchObject({ status: "captured" });
    expect(publish).toHaveBeenCalled();
    await expect(second).resolves.toMatchObject({ status: "captured" });
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("creates one UUID, snapshots the active section just before note.add, and publishes after acknowledgement", async () => {
    const order: string[] = [];
    const { coordinator, execute, createId, publish } = makeCoordinator({
      activeSectionId: () => { order.push("section"); return "current-section"; },
      createId: () => { order.push("id"); return "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5"; },
      execute: async () => { order.push("persisted"); return { ok: true, value: {} as KopperDocument }; },
      publish: () => { order.push("published"); },
    });

    await expect(coordinator.requestCapture()).resolves.toEqual({
      status: "captured",
      noteId: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
    });
    expect(createId).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({
      type: "note.add",
      id: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
      sectionId: "current-section",
      body: "exact text",
    });
    expect(order).toEqual(["id", "section", "persisted", "published"]);
    expect(publish).toHaveBeenCalledWith({ status: "captured", noteId: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5" });
  });

  it("maps nothing selected to empty and capture failures to failed without commands", async () => {
    const failures: KopperError[] = [
      { code: "nothing_selected", message: "none", retryable: true },
      timeout,
      { code: "permission_denied", message: "denied", retryable: true, recoveryAction: "open_settings" },
    ];
    const { coordinator, execute, publish } = makeCoordinator({
      capture: async () => ({ ok: false, error: failures.shift()! }),
    });

    await expect(coordinator.requestCapture()).resolves.toEqual({ status: "empty" });
    await expect(coordinator.requestCapture()).resolves.toEqual({ status: "failed", error: timeout });
    await expect(coordinator.requestCapture()).resolves.toEqual({
      status: "failed",
      error: { code: "permission_denied", message: "denied", retryable: true, recoveryAction: "open_settings" },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledTimes(3);
  });

  it("sanitizes persistence and unexpected rejections and recovers its promise chain", async () => {
    const writeError: KopperError = { code: "write_failed", message: "/secret/path native detail", retryable: true };
    let attempt = 0;
    const { coordinator, publish } = makeCoordinator({
      capture: async () => {
        attempt += 1;
        if (attempt === 1) throw new Error("secret selected text");
        return { ok: true, value: "private note" };
      },
      execute: async () => ({ ok: false, error: writeError }),
    });

    await expect(coordinator.requestCapture()).resolves.toEqual({
      status: "failed",
      error: { code: "capture_failed", message: "Kopper could not capture the selected text.", retryable: true },
    });
    await expect(coordinator.requestCapture()).resolves.toEqual({
      status: "failed",
      error: { code: "write_failed", message: "Captured text could not be saved.", retryable: true, recoveryAction: "retry" },
    });
    expect(JSON.stringify(publish.mock.calls)).not.toMatch(/secret|private note/);
  });
});
