import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarkdownEditor } from "./MarkdownEditor.js";

afterEach(cleanup);

const confirm = vi.fn();
beforeEach(() => {
  confirm.mockReset();
  vi.stubGlobal("confirm", confirm);
});

describe("MarkdownEditor", () => {
  it("renders GFM without interpreting raw HTML", () => {
    render(
      <MarkdownEditor
        noteId="note-1"
        body={"- [x] shipped\n\n<script>alert(1)</script>"}
        editing={false}
        onEditingChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByText("<script>alert(1)</script>")).toBeVisible();
    expect(document.querySelector("script")).toBeNull();
  });

  it("saves nonblank edits only after Cmd+Enter is acknowledged", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(true);
    const onEditingChange = vi.fn();
    render(
      <MarkdownEditor
        noteId="note-1"
        body="Original"
        editing
        onEditingChange={onEditingChange}
        onSave={onSave}
      />,
    );

    const editor = screen.getByRole("textbox", { name: "Edit note" });
    await user.clear(editor);
    await user.type(editor, "Updated");
    fireEvent.keyDown(editor, { key: "Enter", metaKey: true });

    expect(onSave).toHaveBeenCalledWith("Updated");
    await vi.waitFor(() => expect(onEditingChange).toHaveBeenCalledWith(false));
  });

  it("does not save blank content", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <MarkdownEditor noteId="note-1" body="Original" editing onEditingChange={vi.fn()} onSave={onSave} />,
    );
    const editor = screen.getByRole("textbox", { name: "Edit note" });
    await user.clear(editor);
    await user.type(editor, "   ");
    fireEvent.keyDown(editor, { key: "Enter", metaKey: true });

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("A note cannot be blank.")).toBeVisible();
  });

  it("confirms dirty Escape discard and exits only when accepted", async () => {
    const user = userEvent.setup();
    const onEditingChange = vi.fn();
    render(
      <MarkdownEditor noteId="note-1" body="Original" editing onEditingChange={onEditingChange} onSave={vi.fn()} />,
    );
    const editor = screen.getByRole("textbox", { name: "Edit note" });
    await user.type(editor, " changed");

    confirm.mockReturnValueOnce(false);
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(onEditingChange).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(confirm).toHaveBeenCalledWith("Discard your unsaved changes?");
    expect(onEditingChange).toHaveBeenCalledWith(false);
  });
});
