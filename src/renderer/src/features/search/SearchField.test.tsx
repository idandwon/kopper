import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchField } from "./SearchField";

afterEach(cleanup);

function ControlledSearch() {
  const [query, setQuery] = useState("");
  return <SearchField query={query} onQueryChange={setQuery} />;
}

describe("SearchField", () => {
  it("focuses search with Cmd+K when focus is outside an editor", () => {
    render(
      <>
        <button type="button">Outside</button>
        <ControlledSearch />
      </>,
    );
    screen.getByRole("button", { name: "Outside" }).focus();

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    expect(
      screen.getByRole("searchbox", { name: "Search notes" }),
    ).toHaveFocus();
  });

  it.each(["checkbox", "color", "range", "button"])(
    "focuses search from a non-text %s input",
    (type) => {
      render(
        <>
          <input type={type} aria-label={`${type} control`} />
          <ControlledSearch />
        </>,
      );
      const control = screen.getByLabelText(`${type} control`);
      control.focus();

      fireEvent.keyDown(window, { key: "k", metaKey: true });

      expect(
        screen.getByRole("searchbox", { name: "Search notes" }),
      ).toHaveFocus();
    },
  );

  it("does not steal Cmd+K from another text editor", () => {
    render(
      <>
        <textarea aria-label="Editor" />
        <ControlledSearch />
      </>,
    );
    screen.getByRole("textbox", { name: "Editor" }).focus();

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    expect(screen.getByRole("textbox", { name: "Editor" })).toHaveFocus();
  });

  it.each(["text", "search", "email", "number", "password", "tel", "url"])(
    "does not steal Cmd+K from a text-editable %s input",
    (type) => {
      render(
        <>
          <input type={type} aria-label={`${type} editor`} />
          <ControlledSearch />
        </>,
      );
      const editor = screen.getByLabelText(`${type} editor`);
      editor.focus();

      fireEvent.keyDown(window, { key: "k", metaKey: true });

      expect(editor).toHaveFocus();
    },
  );

  it("suppresses Cmd+K in editable content but not contenteditable=false", () => {
    const { rerender } = render(
      <>
        <div contentEditable tabIndex={0} aria-label="Rich editor" />
        <ControlledSearch />
      </>,
    );
    const editor = screen.getByLabelText("Rich editor");
    editor.focus();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(editor).toHaveFocus();

    rerender(
      <>
        <div contentEditable={false} tabIndex={0} aria-label="Static content" />
        <ControlledSearch />
      </>,
    );
    const staticContent = screen.getByLabelText("Static content");
    staticContent.focus();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("searchbox", { name: "Search notes" })).toHaveFocus();
  });

  it("does not run Cmd+K while focus is inside a dialog", () => {
    render(
      <>
        <div role="dialog" aria-label="Editor dialog">
          <button type="button">Dialog action</button>
        </div>
        <ControlledSearch />
      </>,
    );
    screen.getByRole("button", { name: "Dialog action" }).focus();

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    expect(screen.getByRole("button", { name: "Dialog action" })).toHaveFocus();
  });

  it("clears a non-empty query on Escape before dismissing focus", async () => {
    const user = userEvent.setup();
    render(<ControlledSearch />);
    const search = screen.getByRole("searchbox", { name: "Search notes" });
    await user.type(search, "oxide");

    await user.keyboard("{Escape}");
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(search).not.toHaveFocus();
  });

  it("is controlled", () => {
    const onQueryChange = vi.fn();
    render(<SearchField query="ledger" onQueryChange={onQueryChange} />);

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "oxide" },
    });

    expect(onQueryChange).toHaveBeenCalledWith("oxide");
  });
});
