import { useEffect, useRef } from "react";

const TEXT_EDITABLE_INPUT_TYPES = new Set([
  "email",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "url",
]);

function isEditableContent(element: HTMLElement): boolean {
  if (element.isContentEditable) return true;
  const editableRoot = element.closest<HTMLElement>("[contenteditable]");
  const editableValue = editableRoot
    ?.getAttribute("contenteditable")
    ?.toLocaleLowerCase();
  return (
    editableValue === "" ||
    editableValue === "true" ||
    editableValue === "plaintext-only"
  );
}

function focusedOwnerKeepsShortcut(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const textInput =
    element instanceof HTMLInputElement &&
    TEXT_EDITABLE_INPUT_TYPES.has(element.type);
  return (
    element instanceof HTMLTextAreaElement ||
    textInput ||
    isEditableContent(element) ||
    element.closest("[role=dialog], [role=menu]") !== null
  );
}

interface PanelShortcutsProps {
  disabled: boolean;
  enabled: boolean;
  focusSearch(): void;
  selectAllNotes(): void;
  undo(): void;
}

export function PanelShortcuts({
  disabled,
  enabled,
  focusSearch,
  selectAllNotes,
  undo,
}: PanelShortcutsProps) {
  const actionsRef = useRef({
    disabled,
    enabled,
    focusSearch,
    selectAllNotes,
    undo,
  });
  actionsRef.current = {
    disabled,
    enabled,
    focusSearch,
    selectAllNotes,
    undo,
  };

  useEffect(() => {
    const routePanelShortcut = (event: KeyboardEvent) => {
      if (!actionsRef.current.enabled) return;
      const commandPressed = event.metaKey || event.ctrlKey;
      const modifiedByOption = event.altKey;
      const focusedOwnerKeepsCommand = focusedOwnerKeepsShortcut(
        globalThis.document.activeElement,
      );
      if (!commandPressed || modifiedByOption || focusedOwnerKeepsCommand) return;

      const key = event.key.toLocaleLowerCase();
      const selectAllRequested = key === "a" && !event.shiftKey;
      if (selectAllRequested) {
        event.preventDefault();
        actionsRef.current.selectAllNotes();
        return;
      }

      const searchRequested = key === "k" && !event.shiftKey;
      if (searchRequested) {
        event.preventDefault();
        actionsRef.current.focusSearch();
        return;
      }

      const undoRequested = key === "z" && !event.shiftKey;
      if (!undoRequested || actionsRef.current.disabled) return;
      event.preventDefault();
      actionsRef.current.undo();
    };

    globalThis.addEventListener("keydown", routePanelShortcut);
    return () => globalThis.removeEventListener("keydown", routePanelShortcut);
  }, []);

  return null;
}
