import {
  useEffect,
  useState,
  type ComponentProps,
  type KeyboardEvent,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { FieldError } from "../../components/ui/field";
import { Textarea } from "../../components/ui/textarea";
import { useNotesSurfaceOverlay } from "../notes/NotesSurfaceVisibility";

function InertMarkdownLink({ children }: ComponentProps<"a">) {
  return <span>{children}</span>;
}

const MARKDOWN_COMPONENTS: Components = {
  a: InertMarkdownLink,
};
const MARKDOWN_PLUGINS = [remarkGfm];

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
  const [discardOpen, setDiscardOpen] = useState(false);
  const discardOverlay = useNotesSurfaceOverlay(discardOpen, setDiscardOpen);

  useEffect(() => {
    if (!editing) {
      setDraft(body);
      setValidationMessage(null);
      setDiscardOpen(false);
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

  const closeEditor = () => {
    setDraft(body);
    setValidationMessage(null);
    setDiscardOpen(false);
    onEditingChange(false);
  };

  const requestDiscard = () => {
    if (saving) return;
    if (draft === body) {
      closeEditor();
      return;
    }
    setDiscardOpen(true);
  };

  const discard = () => {
    if (saving) return;
    closeEditor();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      requestDiscard();
    }
  };

  if (!editing) {
    return (
      <div className="kopper-markdown min-w-0" data-note-markdown={noteId}>
        <ReactMarkdown
          remarkPlugins={MARKDOWN_PLUGINS}
          components={MARKDOWN_COMPONENTS}
        >
          {body}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-2" data-note-editor={noteId}>
      <Textarea
        className="min-w-0"
        aria-label="Edit note"
        autoFocus={autoFocus}
        disabled={disabled || saving}
        value={draft}
        rows={6}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          setValidationMessage(null);
        }}
        onKeyDown={handleKeyDown}
      />
      {validationMessage === null ? null : (
        <FieldError role="alert">
          {validationMessage}
        </FieldError>
      )}
      <div className="flex min-w-0 flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={requestDiscard}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={disabled || saving || draft.trim().length === 0}
          onClick={() => void save()}
        >
          Save
        </Button>
      </div>
      <AlertDialog
        open={discardOverlay.open}
        onOpenChange={(open) => {
          if (!saving) discardOverlay.onOpenChange(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits will be lost if you discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={saving}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={saving}
              onClick={discard}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
