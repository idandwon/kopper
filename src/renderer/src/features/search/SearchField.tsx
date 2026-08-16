import { useEffect, useRef } from "react";

import { Input } from "../../components/ui/input";

export interface SearchFieldProps {
  query: string;
  onQueryChange(query: string): void;
}

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
  const value = editableRoot?.getAttribute("contenteditable")?.toLowerCase();
  return value === "" || value === "true" || value === "plaintext-only";
}

function stopsApplicationShortcuts(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      TEXT_EDITABLE_INPUT_TYPES.has(element.type)) ||
    isEditableContent(element) ||
    element.closest("[role=dialog]") !== null
  );
}

export function SearchField({ query, onQueryChange }: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        event.key.toLocaleLowerCase() !== "k" ||
        (!event.metaKey && !event.ctrlKey) ||
        event.altKey ||
        stopsApplicationShortcuts(document.activeElement)
      ) {
        return;
      }

      event.preventDefault();
      inputRef.current?.focus();
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <div className="relative w-full">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
      >
        ⌕
      </span>
      <Input
        ref={inputRef}
        type="search"
        aria-label="Search notes"
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          if (query.length > 0) onQueryChange("");
          else event.currentTarget.blur();
        }}
        placeholder="Search notes"
        className="h-10 rounded-lg bg-card pr-14 pl-9 text-sm"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
        ⌘ K
      </kbd>
    </div>
  );
}
