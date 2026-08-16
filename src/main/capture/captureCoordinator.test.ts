import { describe, expect, it, vi } from "vitest";

import {
  createEmptyDocument,
  type KopperDocument,
} from "../../shared/domain/document";
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
  addCapturedNote?: (input: {
    id: string;
    body: string;
  }) => Promise<Result<KopperDocument, KopperError>>;
  currentResult?: () => Result<KopperDocument, KopperError>;
  createId?: () => string;
  publish?: (outcome: CaptureOutcome) => void;
  repositoryBecameUnhealthy?: () => void;
} = {}) {
  const defaultCapture = async (): Promise<Result<string, KopperError>> => ({
    ok: true,
    value: "exact text",
  });
  const defaultAddCapturedNote = async (): Promise<
    Result<KopperDocument, KopperError>
  > => ({
    ok: true,
    value: createEmptyDocument(),
  });
  const capture = vi.fn(overrides.capture ?? defaultCapture);
  const addCapturedNote = vi.fn(
    overrides.addCapturedNote ?? defaultAddCapturedNote,
  );
  const currentResult = vi.fn(
    overrides.currentResult ??
      (() => ({ ok: true as const, value: createEmptyDocument() })),
  );
  const createId = vi.fn(
    overrides.createId ??
      (() => "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5"),
  );
  const publish = vi.fn(overrides.publish ?? (() => undefined));
  const repositoryBecameUnhealthy = vi.fn(
    overrides.repositoryBecameUnhealthy ?? (() => undefined),
  );
  return {
    coordinator: new CaptureCoordinator(
      { capture },
      { addCapturedNote },
      { currentResult },
      { createId, publish, repositoryBecameUnhealthy },
    ),
    capture,
    addCapturedNote,
    currentResult,
    createId,
    publish,
    repositoryBecameUnhealthy,
  };
}

describe("CaptureCoordinator", () => {
  it("strictly serializes capture restoration through persistence and outcome publication", async () => {
    const firstCapture = deferred<Result<string, KopperError>>();
    const firstWrite = deferred<Result<KopperDocument, KopperError>>();
    const captures = [firstCapture.promise, Promise.resolve({ ok: true as const, value: "second" })];
    const writes = [
      firstWrite.promise,
      Promise.resolve({
        ok: true as const,
        value: createEmptyDocument(),
      }),
    ];
    const { coordinator, capture, addCapturedNote, publish } = makeCoordinator({
      capture: () => captures.shift()!,
      addCapturedNote: () => writes.shift()!,
    });

    const first = coordinator.requestCapture();
    const second = coordinator.requestCapture();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(1));
    firstCapture.resolve({ ok: true, value: "first" });
    await vi.waitFor(() => expect(addCapturedNote).toHaveBeenCalledTimes(1));
    expect(capture).toHaveBeenCalledTimes(1);
    firstWrite.resolve({ ok: true, value: createEmptyDocument() });
    await expect(first).resolves.toMatchObject({ status: "captured" });
    expect(publish).toHaveBeenCalled();
    await expect(second).resolves.toMatchObject({ status: "captured" });
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("creates one UUID and delegates active-section resolution to the command transaction", async () => {
    const order: string[] = [];
    const { coordinator, addCapturedNote, createId, publish } = makeCoordinator({
      createId: () => {
        order.push("id");
        return "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5";
      },
      addCapturedNote: async () => {
        order.push("persisted");
        return { ok: true, value: createEmptyDocument() };
      },
      publish: () => {
        order.push("published");
      },
    });

    await expect(coordinator.requestCapture()).resolves.toEqual({
      status: "captured",
      noteId: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
    });
    expect(createId).toHaveBeenCalledOnce();
    expect(addCapturedNote).toHaveBeenCalledWith({
      id: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
      body: "exact text",
    });
    expect(order).toEqual(["id", "persisted", "published"]);
    expect(publish).toHaveBeenCalledWith({
      status: "captured",
      noteId: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
    });
  });

  it("maps nothing selected to empty and capture failures to failed without commands", async () => {
    const failures: KopperError[] = [
      { code: "nothing_selected", message: "none", retryable: true },
      timeout,
      { code: "permission_denied", message: "denied", retryable: true, recoveryAction: "open_settings" },
    ];
    const { coordinator, addCapturedNote, publish } = makeCoordinator({
      capture: async () => ({ ok: false, error: failures.shift()! }),
    });

    await expect(coordinator.requestCapture()).resolves.toEqual({ status: "empty" });
    await expect(coordinator.requestCapture()).resolves.toEqual({ status: "failed", error: timeout });
    await expect(coordinator.requestCapture()).resolves.toEqual({
      status: "failed",
      error: { code: "permission_denied", message: "denied", retryable: true, recoveryAction: "open_settings" },
    });
    expect(addCapturedNote).not.toHaveBeenCalled();
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
      addCapturedNote: async () => ({ ok: false, error: writeError }),
    });

    await expect(coordinator.requestCapture()).resolves.toEqual({
      status: "failed",
      error: { code: "capture_failed", message: "Kopper could not capture the selected text.", retryable: true },
    });
    await expect(coordinator.requestCapture()).resolves.toEqual({
      status: "failed",
      error: {
        code: "write_failed",
        message: "Captured text could not be saved.",
        retryable: true,
      },
    });
    expect(JSON.stringify(publish.mock.calls)).not.toMatch(/secret|private note/);
  });

  it("does not invoke selection or commands while the repository is in recovery", async () => {
    const repositoryError: KopperError = {
      code: "invalid_document",
      message: "private malformed bytes detail",
      retryable: false,
      recoveryAction: "choose_file",
    };
    const {
      coordinator,
      capture,
      addCapturedNote,
      repositoryBecameUnhealthy,
      publish,
    } = makeCoordinator({
      currentResult: () => ({ ok: false, error: repositoryError }),
    });

    await expect(coordinator.requestCapture()).resolves.toEqual({
      status: "failed",
      error: {
        code: "capture_failed",
        message: "Kopper cannot capture until its document store is available.",
        retryable: false,
        recoveryAction: "choose_file",
      },
    });
    expect(capture).not.toHaveBeenCalled();
    expect(addCapturedNote).not.toHaveBeenCalled();
    expect(repositoryBecameUnhealthy).toHaveBeenCalledOnce();
    expect(JSON.stringify(publish.mock.calls)).not.toContain("private");
  });

  it("keeps captured success when outcome publication throws", async () => {
    const publish = vi.fn(() => {
      throw new Error("window destroyed during send");
    });
    const { coordinator, addCapturedNote } = makeCoordinator({ publish });

    await expect(coordinator.requestCapture()).resolves.toEqual({
      status: "captured",
      noteId: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
    });
    expect(addCapturedNote).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledOnce();
  });

  it("preserves retryability and recovery action while sanitizing write failures", async () => {
    const repositoryBecameUnhealthy = vi.fn();
    const { coordinator } = makeCoordinator({
      addCapturedNote: async () => ({
        ok: false,
        error: {
          code: "write_failed",
          message: "/private/store uncertain detail",
          retryable: false,
          recoveryAction: "choose_file",
        },
      }),
      repositoryBecameUnhealthy,
    });

    await expect(coordinator.requestCapture()).resolves.toEqual({
      status: "failed",
      error: {
        code: "write_failed",
        message: "Captured text could not be saved.",
        retryable: false,
        recoveryAction: "choose_file",
      },
    });
    expect(repositoryBecameUnhealthy).toHaveBeenCalledOnce();
  });
});
