import { useState } from "react";

import { Button } from "../../components/ui/button";
import { useKopperDocument } from "../../app/DocumentProvider";
import { MarkdownEditor } from "./MarkdownEditor";

export function expandedEditorNoteId(hash: string): string | null {
  const parameters = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const noteId = parameters.get("editor");
  return noteId === null || noteId.length === 0 ? null : noteId;
}

export function ExpandedEditorWindow({ noteId }: { noteId: string }) {
  const { document, execute, pendingAction } = useKopperDocument();
  const [editing, setEditing] = useState(true);
  const note = document.notes.find(({ id }) => id === noteId);

  if (note === undefined) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-2xl place-items-center p-8 text-foreground">
        <p role="alert">This note no longer exists.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-2xl content-start gap-4 bg-background p-8 text-foreground">
      <header className="flex items-center justify-between gap-3">
        <h1 className="m-0 text-base font-semibold">Edit note</h1>
        {!editing && (
          <Button type="button" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </header>
      <MarkdownEditor
        noteId={note.id}
        body={note.body}
        editing={editing}
        disabled={pendingAction !== null}
        autoFocus
        onEditingChange={setEditing}
        onSave={(body) => execute({ type: "note.edit", noteId: note.id, body })}
      />
    </main>
  );
}
