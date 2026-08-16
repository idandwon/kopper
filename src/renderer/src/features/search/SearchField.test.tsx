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
