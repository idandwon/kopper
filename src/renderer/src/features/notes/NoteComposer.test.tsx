import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KopperDocument } from "../../../../shared/domain/document";
import {
  useKopperDocument,
  type KopperDocumentContextValue,
} from "../../app/DocumentProvider";
import { NoteComposer } from "./NoteComposer";

vi.mock("../../app/DocumentProvider", () => ({ useKopperDocument: vi.fn() }));

const timestamp = "2026-08-16T12:00:00.000Z";
const document: KopperDocument = {
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
  notes: [],
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

const execute =
  vi.fn<
    (
      command: Parameters<KopperDocumentContextValue["execute"]>[0],
    ) => Promise<boolean>
  >();
const mockedUseKopperDocument = vi.mocked(useKopperDocument);

beforeEach(() => {
  vi.useFakeTimers();
  execute.mockReset().mockResolvedValue(true);
  mockedUseKopperDocument.mockReturnValue({
    document,
    ready: true,
    pendingAction: null,
    error: null,
    execute,
    undo: vi.fn(),
    retryLastAction: vi.fn(),
    clearError: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("NoteComposer", () => {
  it("renders one compact composer without a visible add control", () => {
    render(<NoteComposer />);

    const composer = screen.getByRole("textbox", {
      name: "Add a note or prompt",
    });
    expect(composer).toHaveAttribute("placeholder", "Add a note or prompt");
    expect(composer).toHaveAttribute("rows", "1");
    expect(composer).toHaveAttribute("data-slot", "input-group-control");
    expect(composer).toHaveClass(
      "min-h-9",
      "max-h-36",
      "[field-sizing:content]",
    );
    expect(composer.closest("[data-slot=input-group]")).toHaveAttribute(
      "data-composer-surface",
      "true",
    );
    expect(screen.queryByText("Inbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add note" })).not.toBeInTheDocument();
  });

  it("initializes from a valid persisted draft and saves typing after 250ms", async () => {
    mockedUseKopperDocument.mockReturnValue({
      ...mockedUseKopperDocument(),
      document: {
        ...document,
        draft: { body: "Saved", sectionId: "inbox", updatedAt: timestamp },
      },
    });
    render(<NoteComposer />);
    const composer = screen.getByRole("textbox", {
      name: "Add a note or prompt",
    });
    expect(composer).toHaveValue("Saved");

    fireEvent.change(composer, { target: { value: "Saved draft" } });
    await act(() => vi.advanceTimersByTimeAsync(249));
    expect(execute).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(execute).toHaveBeenCalledWith({
      type: "draft.set",
      sectionId: "inbox",
      body: "Saved draft",
    });
  });

  it("adds on Enter, then clears the draft only after the add is acknowledged", async () => {
    let resolveAdd: ((result: boolean) => void) | undefined;
    execute
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            resolveAdd = resolve;
          }),
      )
      .mockResolvedValueOnce(true);
    render(<NoteComposer />);
    const composer = screen.getByRole("textbox", {
      name: "Add a note or prompt",
    });
    fireEvent.change(composer, { target: { value: "New note" } });
    composer.focus();

    fireEvent.keyDown(composer, { key: "Enter" });
    expect(execute).toHaveBeenCalledWith({
      type: "note.add",
      sectionId: "inbox",
      body: "New note",
    });
    expect(composer).toHaveValue("New note");
    expect(execute).toHaveBeenCalledTimes(1);

    await act(async () => resolveAdd?.(true));
    expect(execute).toHaveBeenNthCalledWith(2, { type: "draft.clear" });
    expect(composer).toHaveValue("");
    expect(composer).toHaveFocus();
  });

  it("retains the draft when adding fails", async () => {
    execute.mockResolvedValueOnce(false);
    render(<NoteComposer />);
    const composer = screen.getByRole("textbox", {
      name: "Add a note or prompt",
    });
    fireEvent.change(composer, { target: { value: "Keep me" } });

    await act(async () =>
      fireEvent.keyDown(composer, { key: "Enter" }),
    );

    expect(composer).toHaveValue("Keep me");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("blocks duplicate submission after clear failure until retry removes the acknowledged draft", async () => {
    const submittedDocument: KopperDocument = {
      ...document,
      draft: {
        body: "Persisted note",
        sectionId: "inbox",
        updatedAt: timestamp,
      },
    };
    const context = {
      ...mockedUseKopperDocument(),
      document: submittedDocument,
    };
    mockedUseKopperDocument.mockReturnValue(context);
    execute.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { rerender } = render(<NoteComposer />);
    const composer = screen.getByRole("textbox", {
      name: "Add a note or prompt",
    });

    await act(async () =>
      fireEvent.keyDown(composer, { key: "Enter" }),
    );

    expect(execute).toHaveBeenNthCalledWith(1, {
      type: "note.add",
      sectionId: "inbox",
      body: "Persisted note",
    });
    expect(execute).toHaveBeenNthCalledWith(2, { type: "draft.clear" });
    expect(composer).toHaveValue("Persisted note");
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(execute).toHaveBeenCalledTimes(2);

    mockedUseKopperDocument.mockReturnValue({
      ...context,
      document: { ...submittedDocument, draft: null },
    });
    rerender(<NoteComposer />);

    expect(composer).toHaveValue("");
    fireEvent.change(composer, { target: { value: "Another note" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(execute).toHaveBeenNthCalledWith(3, {
      type: "note.add",
      sectionId: "inbox",
      body: "Another note",
    });
  });

  it("uses Shift+Enter for a newline and prevents whitespace-only submission", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<NoteComposer />);
    const composer = screen.getByRole("textbox", {
      name: "Add a note or prompt",
    });

    await user.type(composer, "First{Shift>}{Enter}{/Shift}Second");
    expect(composer).toHaveValue("First\nSecond");

    await user.clear(composer);
    await user.type(composer, "   ");
    await user.keyboard("{Enter}");
    expect(execute).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "note.add" }),
    );
  });

  it("keeps Cmd/Ctrl+Enter aliases and ignores Enter during IME composition", () => {
    render(<NoteComposer />);
    const composer = screen.getByRole("textbox", {
      name: "Add a note or prompt",
    });
    fireEvent.change(composer, { target: { value: "Composed note" } });

    fireEvent.keyDown(composer, {
      key: "Enter",
      metaKey: true,
      isComposing: true,
    });
    expect(execute).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "note.add" }),
    );

    fireEvent.keyDown(composer, { key: "Enter", ctrlKey: true });
    expect(execute).toHaveBeenCalledWith({
      type: "note.add",
      sectionId: "inbox",
      body: "Composed note",
    });
  });

  it("flushes a changed non-empty draft once on unmount without waiting", () => {
    const { unmount } = render(<NoteComposer />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Latest" },
    });

    unmount();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      type: "draft.set",
      sectionId: "inbox",
      body: "Latest",
    });
  });

  it("clears a persisted draft when emptied immediately before unmount", () => {
    mockedUseKopperDocument.mockReturnValue({
      ...mockedUseKopperDocument(),
      document: {
        ...document,
        draft: { body: "Saved", sectionId: "inbox", updatedAt: timestamp },
      },
    });
    const { unmount } = render(<NoteComposer />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "" },
    });

    unmount();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ type: "draft.clear" });
  });

  it("waits for an in-flight save before flushing the latest value once", async () => {
    let resolveFirst: ((result: boolean) => void) | undefined;
    execute.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const { unmount } = render(<NoteComposer />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Save A" },
    });
    await act(() => vi.advanceTimersByTimeAsync(250));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Save B" },
    });

    unmount();

    expect(execute).toHaveBeenCalledTimes(1);
    await act(async () => resolveFirst?.(true));
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenLastCalledWith({
      type: "draft.set",
      sectionId: "inbox",
      body: "Save B",
    });
  });

  it("keeps an in-flight save as the cleanup barrier after another debounce", async () => {
    let resolveFirst: ((result: boolean) => void) | undefined;
    execute.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const { unmount } = render(<NoteComposer />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Save A" },
    });
    await act(() => vi.advanceTimersByTimeAsync(250));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Save B" },
    });
    await act(() => vi.advanceTimersByTimeAsync(250));

    expect(execute).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => resolveFirst?.(true));

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenLastCalledWith({
      type: "draft.set",
      sectionId: "inbox",
      body: "Save B",
    });
  });

  it("does not save the latest value again when its own debounce fires", async () => {
    let resolveFirst: ((result: boolean) => void) | undefined;
    execute.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    render(<NoteComposer />);
    const composer = screen.getByRole("textbox");
    fireEvent.change(composer, { target: { value: "Save A" } });
    await act(() => vi.advanceTimersByTimeAsync(250));
    fireEvent.change(composer, { target: { value: "Save B" } });
    await act(() => vi.advanceTimersByTimeAsync(250));
    fireEvent.change(composer, { target: { value: "Save C" } });

    await act(async () => resolveFirst?.(true));
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenLastCalledWith({
      type: "draft.set",
      sectionId: "inbox",
      body: "Save C",
    });

    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("clears after an in-flight save settles when the latest value is empty", async () => {
    let resolveFirst: ((result: boolean) => void) | undefined;
    execute.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const { unmount } = render(<NoteComposer />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Save A" },
    });
    await act(() => vi.advanceTimersByTimeAsync(250));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });

    unmount();

    expect(execute).toHaveBeenCalledTimes(1);
    await act(async () => resolveFirst?.(true));
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenLastCalledWith({ type: "draft.clear" });
  });

  it("does not flush again when the debounced draft is already latest", async () => {
    let resolveSave: ((result: boolean) => void) | undefined;
    execute.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const { unmount } = render(<NoteComposer />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Acknowledged" },
    });
    await act(() => vi.advanceTimersByTimeAsync(250));

    unmount();
    await act(async () => resolveSave?.(true));

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("follows active section changes when there is no persisted or local draft", () => {
    const secondSection = {
      ...document.sections[0],
      id: "later",
      title: "Later",
      order: 1,
    };
    const context = {
      ...mockedUseKopperDocument(),
      document: {
        ...document,
        sections: [...document.sections, secondSection],
      },
    };
    mockedUseKopperDocument.mockReturnValue(context);
    const { rerender } = render(<NoteComposer />);

    mockedUseKopperDocument.mockReturnValue({
      ...context,
      document: { ...context.document, activeSectionId: "later" },
    });
    rerender(<NoteComposer />);

    expect(screen.getByRole("textbox")).toHaveAttribute(
      "placeholder",
      "Add a note or prompt",
    );
  });

  it.each([
    ["persisted", "Saved"],
    ["local", "Local"],
  ])(
    "keeps a %s draft pinned when the active section changes",
    (kind, value) => {
      const secondSection = {
        ...document.sections[0],
        id: "later",
        title: "Later",
        order: 1,
      };
      const context = {
        ...mockedUseKopperDocument(),
        document: {
          ...document,
          sections: [...document.sections, secondSection],
          draft:
            kind === "persisted"
              ? { body: value, sectionId: "inbox", updatedAt: timestamp }
              : null,
        },
      };
      mockedUseKopperDocument.mockReturnValue(context);
      const { rerender } = render(<NoteComposer />);
      if (kind === "local") {
        fireEvent.change(screen.getByRole("textbox"), {
          target: { value },
        });
      }

      mockedUseKopperDocument.mockReturnValue({
        ...context,
        document: { ...context.document, activeSectionId: "later" },
      });
      rerender(<NoteComposer />);

      expect(screen.getByRole("textbox")).toHaveAttribute(
        "placeholder",
        "Add a note or prompt",
      );
      expect(screen.getByRole("textbox")).toHaveValue(value);
    },
  );
});
