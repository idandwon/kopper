import { useState, type ReactNode } from "react";

import { Button } from "../../components/ui/button";
import { ScrollArea } from "../../components/ui/scroll-area";
import { useKopperDocument } from "../../app/DocumentProvider";
import { MarkdownEditor } from "./MarkdownEditor";

export function expandedEditorNoteId(hash: string): string | null {
  const parameters = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const noteId = parameters.get("editor");
  return noteId === null || noteId.length === 0 ? null : noteId;
}

function EditorStatus({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex h-dvh min-h-0 min-w-0 w-full max-w-2xl flex-col overflow-hidden bg-background text-foreground">
      <header className="min-w-0 shrink-0 border-b border-border px-4 py-4 sm:px-8">
        <h1 className="m-0 break-words text-base font-semibold">Edit note</h1>
      </header>
      <ScrollArea
        data-scroll-owner="editor"
        className="min-h-0 min-w-0 flex-1"
        aria-label="Editor content"
      >
        <div className="grid min-h-full min-w-0 place-items-center p-4 sm:p-8">
          {children}
        </div>
      </ScrollArea>
    </main>
  );
}

export function ExpandedEditorWindow({ noteId }: { noteId: string }) {
  const { document, error, execute, pendingAction, ready } = useKopperDocument();
  const [editing, setEditing] = useState(true);
  const note = document.notes.find(({ id }) => id === noteId);

  if (pendingAction === "load") {
    return (
      <EditorStatus>
        <div
          role="progressbar"
          aria-label="Loading note"
          aria-valuetext="Loading note"
          className="h-1 w-24 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full w-1/2 rounded-full bg-primary motion-safe:animate-pulse" />
        </div>
      </EditorStatus>
    );
  }

  if (!ready && error !== null) {
    return (
      <EditorStatus>
        <p role="alert">{error.message}</p>
      </EditorStatus>
    );
  }

  if (note === undefined) {
    return (
      <EditorStatus>
        <p role="alert">This note no longer exists.</p>
      </EditorStatus>
    );
  }

  return (
    <main className="mx-auto flex h-dvh min-h-0 min-w-0 w-full max-w-2xl flex-col overflow-hidden bg-background text-foreground">
      <header className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-8">
        <h1 className="m-0 min-w-0 break-words text-base font-semibold">
          Edit note
        </h1>
        {!editing && (
          <Button type="button" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </header>
      <ScrollArea
        data-scroll-owner="editor"
        className="min-h-0 min-w-0 flex-1"
        aria-label="Editor content"
      >
        <div className="min-w-0 p-4 sm:p-8">
          <MarkdownEditor
            noteId={note.id}
            body={note.body}
            editing={editing}
            disabled={pendingAction !== null}
            autoFocus
            onEditingChange={setEditing}
            onSave={(body) =>
              execute({ type: "note.edit", noteId: note.id, body })
            }
          />
        </div>
      </ScrollArea>
    </main>
  );
}
