import type { KeyboardEvent } from "react";

import { Button } from "../../components/ui/button";
import { useNoteDraft } from "./useNoteDraft";

export function NoteComposer() {
  const { body, changeBody, sectionTitle, submissionBlocked, submit } =
    useNoteDraft();

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const commandPressed = event.metaKey || event.ctrlKey;
    if (event.key !== "Enter" || !commandPressed) return;
    event.preventDefault();
    void submit();
  };

  const addNote = () => {
    void submit();
  };

  return (
    <div
      data-composer-surface="true"
      className="kopper-composer absolute right-4 bottom-4 left-5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-2 rounded-[calc(var(--radius)+0.35rem)] border border-border bg-card p-2 shadow-sm"
    >
      <span
        aria-hidden="true"
        className="mb-3 ml-1 size-3.5 self-start rounded-full border-2 border-[var(--capture)]"
      />
      <label htmlFor="note-composer" className="sr-only">
        Add a note or prompt
      </label>
      <textarea
        id="note-composer"
        value={body}
        onChange={(event) => changeBody(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder={`Add a note or prompt (${sectionTitle})`}
        rows={2}
        className="max-h-36 min-h-12 w-full resize-none border-0 bg-transparent px-1 py-2 text-sm text-card-foreground outline-none placeholder:text-muted-foreground"
      />
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="mb-1"
        onClick={addNote}
        disabled={submissionBlocked}
        aria-label="Add note"
      >
        Add <kbd className="font-mono text-[9px]">⌘↵</kbd>
      </Button>
    </div>
  );
}
