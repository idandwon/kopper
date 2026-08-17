import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarkdownEditor } from "./MarkdownEditor.js";

afterEach(cleanup);

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

  it("renders Markdown links as inert text without a user-controlled href", () => {
    render(
      <MarkdownEditor
        noteId="note-1"
        body="[Open privileged page](https://attacker.example/steal)"
        editing={false}
        onEditingChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const linkText = screen.getByText("Open privileged page");
    expect(linkText.closest("a")).toBeNull();
    expect(linkText).not.toHaveAttribute("href");
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
    expect(editor).toHaveAttribute("data-slot", "textarea");
    await user.clear(editor);
    await user.type(editor, "Updated");
    fireEvent.keyDown(editor, { key: "Enter", metaKey: true });

    expect(onSave).toHaveBeenCalledWith("Updated");
    await vi.waitFor(() => expect(onEditingChange).toHaveBeenCalledWith(false));
  });

  it("does not close or request discard while a save is pending", async () => {
    const user = userEvent.setup();
    let resolveSave: ((acknowledged: boolean) => void) | undefined;
    const onSave = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSave = resolve;
        }),
    );
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
    await user.type(editor, " changed");
    fireEvent.keyDown(editor, { key: "Enter", metaKey: true });

    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled(),
    );
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onEditingChange).not.toHaveBeenCalledWith(false);

    resolveSave?.(false);
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled(),
    );
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

  it("keeps dirty Escape edits until discard is explicitly acknowledged", async () => {
    const user = userEvent.setup();
    const onEditingChange = vi.fn();
    render(
      <MarkdownEditor
        noteId="note-1"
        body="Original"
        editing
        onEditingChange={onEditingChange}
        onSave={vi.fn()}
      />,
    );
    const editor = screen.getByRole("textbox", { name: "Edit note" });
    await user.clear(editor);
    await user.type(editor, "Changed");
    await user.keyboard("{Escape}");

    expect(
      screen.getByRole("alertdialog", {
        name: "Discard your unsaved changes?",
      }),
    ).toBeVisible();
    expect(editor).toHaveValue("Changed");
    expect(onEditingChange).not.toHaveBeenCalledWith(false);

    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(editor).toHaveValue("Changed");
    expect(onEditingChange).not.toHaveBeenCalledWith(false);

    await user.click(editor);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(onEditingChange).toHaveBeenCalledWith(false);
  });

  it("closes unchanged Escape without confirmation", async () => {
    const user = userEvent.setup();
    const onEditingChange = vi.fn();
    render(
      <MarkdownEditor
        noteId="note-1"
        body="Original"
        editing
        onEditingChange={onEditingChange}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("textbox", { name: "Edit note" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onEditingChange).toHaveBeenCalledWith(false);
  });
});
