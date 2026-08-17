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
  it("allows its outer seam to shrink beside adjacent panel controls", () => {
    render(<SearchField query="" onQueryChange={vi.fn()} />);

    expect(
      screen.getByRole("searchbox", { name: "Search notes" }).parentElement,
    ).toHaveClass("min-w-0", "w-full");
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

  it("reports controlled query changes", () => {
    const changeQuery = vi.fn();
    render(<SearchField query="ledger" onQueryChange={changeQuery} />);

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "oxide" },
    });

    expect(changeQuery).toHaveBeenCalledWith("oxide");
  });
});
