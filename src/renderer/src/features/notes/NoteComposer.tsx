import type { KeyboardEvent } from "react";

import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { useNoteDraft } from "./useNoteDraft";

export function NoteComposer() {
  const { body, changeBody, submit } = useNoteDraft();

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    void submit();
  };

  return (
    <div
      data-composer-surface="true"
      className="kopper-composer relative z-20 mx-4 mt-2 mb-4 grid shrink-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-[calc(var(--radius)+0.35rem)] border border-border bg-card p-2 shadow-sm"
    >
      <span
        aria-hidden="true"
        className="mt-3 ml-1 size-3.5 rounded-full border-2 border-[var(--capture)]"
      />
      <Label htmlFor="note-composer" className="sr-only">
        Add a note or prompt
      </Label>
      <Textarea
        id="note-composer"
        value={body}
        onChange={(event) => changeBody(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a note or prompt"
        rows={1}
        className="min-h-10 max-h-36 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-1 py-2 text-card-foreground [field-sizing:content] focus-visible:border-transparent focus-visible:ring-0"
      />
    </div>
  );
}
