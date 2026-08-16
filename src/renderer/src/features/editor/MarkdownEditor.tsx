import { useEffect, useState, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "../../components/ui/button";

export interface MarkdownEditorProps {
  noteId: string;
  body: string;
  editing: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  onEditingChange(editing: boolean): void;
  onSave(body: string): Promise<boolean>;
}

export function MarkdownEditor({
  noteId,
  body,
  editing,
  disabled = false,
  autoFocus = false,
  onEditingChange,
  onSave,
}: MarkdownEditorProps) {
  const [draft, setDraft] = useState(body);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraft(body);
      setValidationMessage(null);
    }
  }, [body, editing]);

  const save = async () => {
    if (draft.trim().length === 0) {
      setValidationMessage("A note cannot be blank.");
      return;
    }

    setSaving(true);
    try {
      if (await onSave(draft)) onEditingChange(false);
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (draft !== body && !globalThis.confirm("Discard your unsaved changes?")) {
      return;
    }
    setDraft(body);
    setValidationMessage(null);
    onEditingChange(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      discard();
    }
  };

  if (!editing) {
    return (
      <div className="kopper-markdown min-w-0" data-note-markdown={noteId}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="grid gap-2" data-note-editor={noteId}>
      <textarea
        aria-label="Edit note"
        autoFocus={autoFocus}
        disabled={disabled || saving}
        value={draft}
        rows={6}
        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onChange={(event) => {
          setDraft(event.target.value);
          setValidationMessage(null);
        }}
        onKeyDown={handleKeyDown}
      />
      {validationMessage !== null && (
        <p role="alert" className="m-0 text-xs text-destructive">
          {validationMessage}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" size="xs" variant="ghost" disabled={saving} onClick={discard}>
          Cancel
        </Button>
        <Button type="button" size="xs" disabled={disabled || saving || draft.trim().length === 0} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}
