import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { KopperDocument } from "../../../shared/domain/document";
import type { KopperApi } from "../../../shared/ipc/contract";
import { useDocument } from "./useDocument";

const timestamp = "2026-08-16T12:00:00.000Z";

function documentWith(body = "Captured note"): KopperDocument {
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

function installApi(initialDocument: KopperDocument) {
  let listener: ((document: KopperDocument) => void) | undefined;
  const unsubscribe = vi.fn();
  const api: KopperApi = {
    getDocument: vi.fn().mockResolvedValue({ ok: true, value: initialDocument }),
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

describe("useDocument", () => {
  it("subscribes before loading, then applies subsequent snapshots", async () => {
    const initialDocument = documentWith();
    const changedDocument = documentWith("Updated note");
    const callOrder: string[] = [];
    let listener: ((document: KopperDocument) => void) | undefined;
    window.kopper = {
      getDocument: vi.fn(async () => {
        callOrder.push("get");
        return { ok: true as const, value: initialDocument };
      }),
      subscribeDocument: vi.fn((nextListener) => {
        callOrder.push("subscribe");
        listener = nextListener;
        return vi.fn();
      }),
    };

    const { result } = renderHook(() => useDocument());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(callOrder).toEqual(["subscribe", "get"]);

    act(() => listener?.(changedDocument));

    expect(result.current).toEqual({
      status: "ready",
      document: changedDocument,
    });
  });

  it("does not overwrite a subscribed snapshot with a stale initial load", async () => {
    const initialDocument = documentWith();
    const changedDocument = documentWith("Newer subscription snapshot");
    let resolveLoad:
      | ((result: { ok: true; value: KopperDocument }) => void)
      | undefined;
    let listener: ((document: KopperDocument) => void) | undefined;
    window.kopper = {
      getDocument: vi.fn(
        () =>
          new Promise<Awaited<ReturnType<KopperApi["getDocument"]>>>((resolve) => {
            resolveLoad = resolve;
          }),
      ),
      subscribeDocument: vi.fn((nextListener) => {
        listener = nextListener;
        return vi.fn();
      }),
    };

    const { result } = renderHook(() => useDocument());
    act(() => listener?.(changedDocument));
    act(() => resolveLoad?.({ ok: true, value: initialDocument }));

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "ready",
        document: changedDocument,
      }),
    );
  });

  it("returns the structured repository error without retrying", async () => {
    const error = {
      code: "read_failed" as const,
      message: "The ledger could not be read.",
      retryable: true,
      recoveryAction: "retry" as const,
    };
    const api = installApi(documentWith()).api;
    vi.mocked(api.getDocument).mockResolvedValue({ ok: false, error });

    const { result } = renderHook(() => useDocument());

    await waitFor(() =>
      expect(result.current).toEqual({ status: "error", error }),
    );
    expect(api.getDocument).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes exactly once and ignores late work after unmount", async () => {
    let resolveLoad:
      | ((result: { ok: true; value: KopperDocument }) => void)
      | undefined;
    const { api, emit, unsubscribe } = installApi(documentWith());
    vi.mocked(api.getDocument).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const { unmount } = renderHook(() => useDocument());

    unmount();
    emit(documentWith("Late subscription snapshot"));
    resolveLoad?.({ ok: true, value: documentWith("Late initial snapshot") });
    await Promise.resolve();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
