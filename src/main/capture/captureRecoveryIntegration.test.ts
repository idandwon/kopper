import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyDocument } from "../../shared/domain/document";
import { CommandService } from "../domain/commandService";
import { MainOperationCoordinator } from "../domain/mainOperationCoordinator";
import { DocumentFiles, type DocumentDialog } from "../files/documentFiles";
import { AtomicReplaceError } from "../persistence/atomicFile";
import { NoteRepository } from "../persistence/noteRepository";
import { CaptureCoordinator } from "./captureCoordinator";
import { CaptureRuntime } from "./captureRuntime";

const directories: string[] = [];
const timestamp = "2026-08-16T12:00:00.000Z";

function cancelledDialog(): DocumentDialog {
  return {
    showOpenDialog: vi.fn().mockResolvedValue({
      canceled: true,
      filePaths: [],
    }),
    showSaveDialog: vi.fn().mockResolvedValue({ canceled: true }),
  };
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("capture recovery integration", () => {
  it("preserves malformed bytes without selection and enables capture after explicit recovery", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kopper-capture-recovery-"));
    directories.push(directory);
    const storePath = join(directory, "kopper.json");
    const malformed = Buffer.from("{private malformed store");
    await writeFile(storePath, malformed);

    const repository = new NoteRepository(storePath);
    const loadResult = await repository.load();
    expect(loadResult.ok).toBe(false);

    const nativeMonitor = {
      start: vi.fn(() => ({ ok: true as const, value: undefined })),
      stop: vi.fn(),
    };
    const monitorFactory = vi.fn(async () => nativeMonitor);
    const captureRuntime = new CaptureRuntime(
      { check: vi.fn(() => "granted" as const) },
      monitorFactory,
      vi.fn(),
    );
    await captureRuntime.start(loadResult.ok);
    expect(monitorFactory).not.toHaveBeenCalled();

    const operations = new MainOperationCoordinator();
    const commandService = new CommandService(
      repository,
      {
        now: () => timestamp,
        createId: () => "generated-id",
        publish: vi.fn(),
      },
      operations,
    );
    const selectionCapture = vi.fn(async () => ({
      ok: true as const,
      value: "captured only after recovery",
    }));
    const coordinator = new CaptureCoordinator(
      { capture: selectionCapture },
      commandService,
      { currentResult: () => repository.currentResult() },
      {
        createId: () => "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
        publish: vi.fn(),
        repositoryBecameUnhealthy: () => {
          void captureRuntime.setRepositoryHealthy(false);
        },
      },
    );

    await expect(coordinator.requestCapture()).resolves.toMatchObject({
      status: "failed",
    });
    expect(selectionCapture).not.toHaveBeenCalled();
    expect(await readFile(storePath)).toEqual(malformed);

    const files = new DocumentFiles(repository, cancelledDialog(), {
      operationCoordinator: operations,
      externalReplacementSucceeded: async () => {
        commandService.clearUndoHistory();
        await captureRuntime.setRepositoryHealthy(true);
      },
    });
    await expect(files.createNewStore()).resolves.toMatchObject({ ok: true });
    expect(monitorFactory).toHaveBeenCalledOnce();
    expect(nativeMonitor.start).toHaveBeenCalledOnce();

    await expect(coordinator.requestCapture()).resolves.toEqual({
      status: "captured",
      noteId: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
    });
    expect(selectionCapture).toHaveBeenCalledOnce();
    expect(JSON.parse(await readFile(storePath, "utf8"))).toMatchObject({
      notes: [
        expect.objectContaining({
          id: "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
          body: "captured only after recovery",
        }),
      ],
    });
  });

  it("stops capture and preserves a nonretryable uncertain-write outcome", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kopper-capture-uncertain-"));
    directories.push(directory);
    const storePath = join(directory, "kopper.json");
    const initial = createEmptyDocument(new Date(timestamp));
    await writeFile(storePath, `${JSON.stringify(initial, null, 2)}\n`);
    const mismatched = structuredClone(initial);
    mismatched.window.pinned = true;
    const writer = vi.fn(async (path: string) => {
      await writeFile(path, `${JSON.stringify(mismatched, null, 2)}\n`);
      throw new AtomicReplaceError(
        "after_rename",
        new Error("directory sync could not be confirmed"),
      );
    });
    const repository = new NoteRepository(storePath, writer);
    expect((await repository.load()).ok).toBe(true);

    const nativeMonitor = {
      start: vi.fn(() => ({ ok: true as const, value: undefined })),
      stop: vi.fn(),
    };
    const runtime = new CaptureRuntime(
      { check: () => "granted" },
      async () => nativeMonitor,
      vi.fn(),
    );
    await runtime.start(true);
    expect(nativeMonitor.start).toHaveBeenCalledOnce();

    const service = new CommandService(repository, {
      now: () => timestamp,
      createId: () => "generated-id",
      publish: vi.fn(),
    });
    const coordinator = new CaptureCoordinator(
      {
        capture: async () => ({
          ok: true,
          value: "private captured text",
        }),
      },
      service,
      { currentResult: () => repository.currentResult() },
      {
        createId: () => "0c47968e-bf67-4c9c-a967-a3dcbe9fc5b5",
        publish: vi.fn(),
        repositoryBecameUnhealthy: () => {
          void runtime.setRepositoryHealthy(false);
        },
      },
    );

    await expect(coordinator.requestCapture()).resolves.toEqual({
      status: "failed",
      error: {
        code: "write_failed",
        message: "Captured text could not be saved.",
        retryable: false,
      },
    });
    expect(repository.currentResult()).toMatchObject({
      ok: false,
      error: { code: "write_failed", retryable: false },
    });
    expect(nativeMonitor.stop).toHaveBeenCalledOnce();
  });
});
