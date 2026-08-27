import type { KeyboardEvent } from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "../../components/ui/input-group";
import { Label } from "../../components/ui/label";
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
    <InputGroup
      data-composer-surface="true"
      className="relative z-20 mx-4 mt-2 mb-4 w-auto shrink-0 items-start gap-1 shadow-sm"
    >
      <InputGroupAddon className="pt-2.5 pl-2">
        <span
          aria-hidden="true"
          className="size-4 rounded-full border-2 border-primary"
        />
      </InputGroupAddon>
      <Label htmlFor="note-composer" className="sr-only">
        Add a note or prompt
      </Label>
      <InputGroupTextarea
        id="note-composer"
        value={body}
        onChange={(event) => changeBody(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a note or prompt"
        rows={1}
        className="min-h-9 max-h-36 overflow-y-auto py-2 pl-1 [field-sizing:content]"
      />
    </InputGroup>
  );
}
