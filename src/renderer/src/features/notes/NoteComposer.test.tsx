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

  it("adds on Cmd+Enter, then clears the draft only after the add is acknowledged", async () => {
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

    fireEvent.keyDown(composer, { key: "Enter", metaKey: true });
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
  });

  it("retains the draft when adding fails", async () => {
    execute.mockResolvedValueOnce(false);
    render(<NoteComposer />);
    const composer = screen.getByRole("textbox", {
      name: "Add a note or prompt",
    });
    fireEvent.change(composer, { target: { value: "Keep me" } });

    await act(async () =>
      fireEvent.keyDown(composer, { key: "Enter", metaKey: true }),
    );

    expect(composer).toHaveValue("Keep me");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("allows Enter to insert a newline and prevents whitespace-only submission", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<NoteComposer />);
    const composer = screen.getByRole("textbox", {
      name: "Add a note or prompt",
    });

    await user.type(composer, "First{enter}Second");
    expect(composer).toHaveValue("First\nSecond");

    await user.clear(composer);
    await user.type(composer, "   ");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    expect(execute).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "note.add" }),
    );
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

  it("does not flush again when the debounced draft was acknowledged", async () => {
    const { unmount } = render(<NoteComposer />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Acknowledged" },
    });
    await act(() => vi.advanceTimersByTimeAsync(250));

    unmount();

    expect(execute).toHaveBeenCalledTimes(1);
  });
});
