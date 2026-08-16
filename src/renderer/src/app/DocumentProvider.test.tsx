import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DocumentCommand } from "../../../shared/domain/commands";
import type { KopperDocument } from "../../../shared/domain/document";
import type { KopperError, Result } from "../../../shared/domain/errors";
import type { KopperApi } from "../../../shared/ipc/contract";
import { DocumentProvider, useKopperDocument } from "./DocumentProvider";

const timestamp = "2026-08-16T12:00:00.000Z";
const retryableError: KopperError = {
  code: "write_failed",
  message: "The document could not be saved.",
  retryable: true,
  recoveryAction: "retry",
};

function documentWith(body = "Before"): KopperDocument {
  return {
    schemaVersion: 1,
    sections: [
      {
        id: "inbox",
        title: "Inbox",
        order: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    notes: [
      {
        id: "note-1",
        sectionId: "inbox",
        body,
        order: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
        previousPlacement: null,
      },
    ],
    activeSectionId: "inbox",
    shortcuts: {
      capture: { kind: "double-modifier", modifier: "shift" },
      togglePanel: "CommandOrControl+Shift+Space",
    },
    window: { pinned: false, bounds: null },
    appearance: { mode: "system", activeThemeId: "oxide-ledger" },
    customThemes: [],
    draft: null,
  };
}

function edit(body = "After"): DocumentCommand {
  return { type: "note.edit", noteId: "note-1", body };
}

function wrapper({ children }: { children: ReactNode }) {
  return <DocumentProvider>{children}</DocumentProvider>;
}

function installApi(
  initialResult: Result<KopperDocument, KopperError> = {
    ok: true,
    value: documentWith(),
  },
) {
  let listener: ((document: KopperDocument) => void) | undefined;
  const unsubscribe = vi.fn();
  const api: KopperApi = {
    getDocument: vi.fn().mockResolvedValue(initialResult),
    execute: vi.fn(),
    undo: vi.fn(),
    subscribeDocument: vi.fn((nextListener) => {
      listener = nextListener;
      return unsubscribe;
    }),
  };
  window.kopper = api;

  return {
    api,
    emit(document: KopperDocument) {
      listener?.(document);
    },
    unsubscribe,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DocumentProvider", () => {
  it("subscribes before the initial fetch and applies acknowledged snapshots", async () => {
    const initial = documentWith();
    const changed = documentWith("Changed elsewhere");
    const callOrder: string[] = [];
    let listener: ((document: KopperDocument) => void) | undefined;
    window.kopper = {
      getDocument: vi.fn(async () => {
        callOrder.push("get");
        return { ok: true as const, value: initial };
      }),
      execute: vi.fn(),
      undo: vi.fn(),
      subscribeDocument: vi.fn((nextListener) => {
        callOrder.push("subscribe");
        listener = nextListener;
        return vi.fn();
      }),
    };

    const { result } = renderHook(() => useKopperDocument(), { wrapper });

    await waitFor(() => expect(result.current.pendingAction).toBeNull());
    expect(callOrder).toEqual(["subscribe", "get"]);
    expect(result.current.document).toEqual(initial);

    act(() => listener?.(changed));
    expect(result.current.document).toEqual(changed);
  });

  it("does not let a stale initial fetch overwrite a subscribed snapshot", async () => {
    let resolveLoad:
      | ((result: { ok: true; value: KopperDocument }) => void)
      | undefined;
    const { api, emit } = installApi();
    vi.mocked(api.getDocument).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const subscribed = documentWith("Newer subscription");
    const { result } = renderHook(() => useKopperDocument(), { wrapper });

    act(() => emit(subscribed));
    act(() => resolveLoad?.({ ok: true, value: documentWith("Stale load") }));

    await waitFor(() => expect(result.current.document).toEqual(subscribed));
  });

  it("preserves a structured initial-load error", async () => {
    const error: KopperError = {
      code: "invalid_document",
      message: "The ledger is malformed.",
      retryable: false,
      recoveryAction: "choose_file",
    };
    installApi({ ok: false, error });

    const { result } = renderHook(() => useKopperDocument(), { wrapper });

    await waitFor(() => expect(result.current.pendingAction).toBeNull());
    expect(result.current.error).toBe(error);
  });

  it("shows pending without optimistic state and commits only a successful result", async () => {
    const { api, emit } = installApi();
    let resolveExecute:
      | ((result: { ok: true; value: KopperDocument }) => void)
      | undefined;
    vi.mocked(api.execute).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExecute = resolve;
        }),
    );
    const changed = documentWith("Persisted");
    const { result } = renderHook(() => useKopperDocument(), { wrapper });
    await waitFor(() => expect(result.current.pendingAction).toBeNull());

    let outcome: Promise<boolean> | undefined;
    act(() => {
      outcome = result.current.execute(edit("Optimistic"));
    });
    expect(result.current.pendingAction).toBe("note.edit");
    expect(result.current.document).toEqual(documentWith());

    act(() => emit(changed));
    expect(result.current.pendingAction).toBe("note.edit");
    expect(result.current.document).toEqual(changed);

    await act(async () => resolveExecute?.({ ok: true, value: changed }));
    await expect(outcome).resolves.toBe(true);
    expect(result.current.document).toEqual(changed);
    expect(result.current.pendingAction).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("preserves document state on failure and clears the error after a later success", async () => {
    const initial = documentWith();
    const changed = documentWith("Later success");
    const { api } = installApi({ ok: true, value: initial });
    vi.mocked(api.execute)
      .mockResolvedValueOnce({ ok: false, error: retryableError })
      .mockResolvedValueOnce({ ok: true, value: changed });
    const { result } = renderHook(() => useKopperDocument(), { wrapper });
    await waitFor(() => expect(result.current.pendingAction).toBeNull());

    await act(async () => {
      await expect(result.current.execute(edit("Failed"))).resolves.toBe(false);
    });
    expect(result.current.document).toEqual(initial);
    expect(result.current.error).toEqual(retryableError);

    await act(async () => {
      await expect(result.current.execute(edit("Succeeded"))).resolves.toBe(true);
    });
    expect(result.current.document).toEqual(changed);
    expect(result.current.error).toBeNull();
  });

  it("retries the exact failed retryable command and clears it on success", async () => {
    const command = edit("Retry me");
    const changed = documentWith("Retried");
    const { api } = installApi();
    vi.mocked(api.execute)
      .mockResolvedValueOnce({ ok: false, error: retryableError })
      .mockResolvedValueOnce({ ok: true, value: changed });
    const { result } = renderHook(() => useKopperDocument(), { wrapper });
    await waitFor(() => expect(result.current.pendingAction).toBeNull());

    await act(async () => {
      await result.current.execute(command);
    });
    await act(async () => {
      await expect(result.current.retryLastAction()).resolves.toBe(true);
    });

    expect(vi.mocked(api.execute).mock.calls[1]?.[0]).toBe(command);
    expect(result.current.document).toEqual(changed);
    expect(result.current.error).toBeNull();
    await expect(result.current.retryLastAction()).resolves.toBe(false);
    expect(api.execute).toHaveBeenCalledTimes(2);
  });

  it("replaces an older retry command with a newer retryable execute failure", async () => {
    const olderCommand = edit("Older");
    const newerCommand = edit("Newer");
    const { api } = installApi();
    vi.mocked(api.execute).mockResolvedValue({
      ok: false,
      error: retryableError,
    });
    const { result } = renderHook(() => useKopperDocument(), { wrapper });
    await waitFor(() => expect(result.current.pendingAction).toBeNull());

    await act(async () => {
      await result.current.execute(olderCommand);
      await result.current.execute(newerCommand);
      await result.current.retryLastAction();
    });

    expect(vi.mocked(api.execute).mock.calls.map(([command]) => command)).toEqual([
      olderCommand,
      newerCommand,
      newerCommand,
    ]);
    expect(vi.mocked(api.execute).mock.calls[2]?.[0]).toBe(newerCommand);
  });

  it("retains the exact retry command after another retryable retry failure", async () => {
    const command = edit("Retry repeatedly");
    const changed = documentWith("Eventually persisted");
    const { api } = installApi();
    vi.mocked(api.execute)
      .mockResolvedValueOnce({ ok: false, error: retryableError })
      .mockResolvedValueOnce({ ok: false, error: retryableError })
      .mockResolvedValueOnce({ ok: true, value: changed });
    const { result } = renderHook(() => useKopperDocument(), { wrapper });
    await waitFor(() => expect(result.current.pendingAction).toBeNull());

    await act(async () => {
      await expect(result.current.execute(command)).resolves.toBe(false);
      await expect(result.current.retryLastAction()).resolves.toBe(false);
      await expect(result.current.retryLastAction()).resolves.toBe(true);
    });

    expect(vi.mocked(api.execute).mock.calls.map(([sent]) => sent)).toEqual([
      command,
      command,
      command,
    ]);
    expect(vi.mocked(api.execute).mock.calls[2]?.[0]).toBe(command);
    expect(result.current.document).toEqual(changed);
  });

  it("does not create retry intent for an initial document error", async () => {
    const initialError: KopperError = {
      code: "read_failed",
      message: "The document could not be loaded.",
      retryable: true,
      recoveryAction: "retry",
    };
    const { api } = installApi({ ok: false, error: initialError });
    const { result } = renderHook(() => useKopperDocument(), { wrapper });
    await waitFor(() => expect(result.current.pendingAction).toBeNull());

    await expect(result.current.retryLastAction()).resolves.toBe(false);

    expect(result.current.error).toBe(initialError);
    expect(api.execute).not.toHaveBeenCalled();
    expect(api.undo).not.toHaveBeenCalled();
  });

  it("clears stale retry intent for non-retryable execute failures and accepted undo", async () => {
    const { api } = installApi();
    vi.mocked(api.execute)
      .mockResolvedValueOnce({ ok: false, error: retryableError })
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "validation_failed",
          message: "The note no longer exists.",
          retryable: false,
        },
      })
      .mockResolvedValueOnce({ ok: false, error: retryableError });
    vi.mocked(api.undo).mockResolvedValue({ ok: false, error: retryableError });
    const { result } = renderHook(() => useKopperDocument(), { wrapper });
    await waitFor(() => expect(result.current.pendingAction).toBeNull());

    await act(async () => {
      await result.current.execute(edit("First"));
      await result.current.execute(edit("Second"));
    });
    await expect(result.current.retryLastAction()).resolves.toBe(false);

    await act(async () => {
      await result.current.execute(edit("Third"));
      await result.current.undo();
    });
    await expect(result.current.retryLastAction()).resolves.toBe(false);
  });

  it("allows only one mutation request in flight", async () => {
    const { api } = installApi();
    let resolveExecute:
      | ((result: { ok: true; value: KopperDocument }) => void)
      | undefined;
    vi.mocked(api.execute).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExecute = resolve;
        }),
    );
    const { result } = renderHook(() => useKopperDocument(), { wrapper });
    await waitFor(() => expect(result.current.pendingAction).toBeNull());

    let first: Promise<boolean> | undefined;
    act(() => {
      first = result.current.execute(edit("First"));
    });
    await expect(result.current.execute(edit("Second"))).resolves.toBe(false);
    await expect(result.current.undo()).resolves.toBe(false);
    await expect(result.current.retryLastAction()).resolves.toBe(false);
    expect(api.execute).toHaveBeenCalledTimes(1);
    expect(api.undo).not.toHaveBeenCalled();

    await act(async () =>
      resolveExecute?.({ ok: true, value: documentWith("First") }),
    );
    await expect(first).resolves.toBe(true);
  });

  it("unsubscribes once and performs no state update after unmount", async () => {
    const { api, emit, unsubscribe } = installApi();
    let resolveExecute:
      | ((result: { ok: false; error: KopperError }) => void)
      | undefined;
    vi.mocked(api.execute).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExecute = resolve;
        }),
    );
    const { result, unmount } = renderHook(() => useKopperDocument(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.pendingAction).toBeNull());
    let operation: Promise<boolean> | undefined;
    act(() => {
      operation = result.current.execute(edit());
    });

    unmount();
    emit(documentWith("Late subscription"));
    resolveExecute?.({ ok: false, error: retryableError });

    await expect(operation).resolves.toBe(false);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
