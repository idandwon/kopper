import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { PanelShortcuts } from "./PanelShortcuts";

function ShortcutHarness({ disabled = false }: { disabled?: boolean }) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [undoCount, setUndoCount] = useState(0);

  return (
    <>
      <button type="button">Outside</button>
      <input ref={searchRef} type="search" aria-label="Search notes" />
      <textarea aria-label="Editor" />
      <div role="dialog" aria-label="Settings dialog">
        <button type="button">Dialog action</button>
      </div>
      <output aria-label="Undo count">{undoCount}</output>
      <PanelShortcuts
        disabled={disabled}
        focusSearch={() => searchRef.current?.focus()}
        undo={() => setUndoCount((currentCount) => currentCount + 1)}
      />
    </>
  );
}

afterEach(cleanup);

describe("panel keyboard shortcuts", () => {
  it("routes Cmd+K and Cmd+Z from non-editable panel controls", () => {
    render(<ShortcutHarness />);
    const outside = screen.getByRole("button", { name: "Outside" });
    outside.focus();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("searchbox", { name: "Search notes" })).toHaveFocus();

    outside.focus();
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(screen.getByRole("status", { name: "Undo count" })).toHaveTextContent("1");
  });

  it("leaves editing and dialog shortcuts with their focused owner", () => {
    render(<ShortcutHarness />);
    const editor = screen.getByRole("textbox", { name: "Editor" });
    editor.focus();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(editor).toHaveFocus();
    expect(screen.getByRole("status", { name: "Undo count" })).toHaveTextContent("0");

    const dialogAction = screen.getByRole("button", { name: "Dialog action" });
    dialogAction.focus();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(dialogAction).toHaveFocus();
    expect(screen.getByRole("status", { name: "Undo count" })).toHaveTextContent("0");
  });

  it("does not run undo while document actions are disabled", () => {
    render(<ShortcutHarness disabled />);
    screen.getByRole("button", { name: "Outside" }).focus();

    fireEvent.keyDown(window, { key: "z", metaKey: true });

    expect(screen.getByRole("status", { name: "Undo count" })).toHaveTextContent("0");
  });
});
