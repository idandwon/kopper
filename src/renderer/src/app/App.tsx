import {
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";

import type { KopperDocument } from "../../../shared/domain/document";
import type { KopperError } from "../../../shared/domain/errors";
import { Button } from "../components/ui/button";
import { ScrollArea } from "../components/ui/scroll-area";
import { AddSectionDialog } from "../features/sections/SectionManager";
import { SectionGroup } from "../features/sections/SectionGroup";
import { NoteComposer } from "../features/notes/NoteComposer";
import {
  initialSelectionState,
  selectionReducer,
} from "../features/notes/selectionReducer";
import { SearchField } from "../features/search/SearchField";
import {
  projectNotes,
  type NoteProjectionView,
} from "../features/search/projectNotes";
import { cn } from "../lib/utils";
import { useKopperDocument } from "./DocumentProvider";

function LifecycleRail() {
  return (
    <div
      className="absolute inset-y-0 left-0 w-1 bg-[linear-gradient(to_bottom,var(--capture),var(--completed))]"
      aria-hidden="true"
    />
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-[380px] flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-background text-foreground">
      <LifecycleRail />
      <span className="sr-only">Lifecycle: captured to completed</span>
      {children}
    </main>
  );
}

function LoadingState() {
  return (
    <Panel>
      <div className="flex flex-1 items-center justify-center p-6">
        <div
          role="progressbar"
          aria-label="Loading notes"
          aria-valuetext="Loading notes"
          className="h-1 w-24 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full w-1/2 rounded-full bg-primary motion-safe:animate-pulse" />
        </div>
      </div>
    </Panel>
  );
}

function GlobalError({
  error,
  retry,
  disabled,
}: {
  error: KopperError;
  retry(): Promise<boolean>;
  disabled: boolean;
}) {
  return (
    <div
      role="alert"
      className="mx-4 mb-2 ml-5 flex items-center gap-3 rounded-lg border border-destructive bg-card p-3 text-sm text-card-foreground"
    >
      <p className="m-0 min-w-0 flex-1">{error.message}</p>
      {error.retryable && (
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => void retry()}
        >
          Retry
        </Button>
      )}
    </div>
  );
}

function ViewButton({
  view,
  current,
  onSelect,
}: {
  view: NoteProjectionView;
  current: NoteProjectionView;
  onSelect(view: NoteProjectionView): void;
}) {
  const active = view === current;
  const label = view === "active" ? "Active notes" : "Completed notes";

  return (
    <Button
      type="button"
      size="xs"
      variant={active ? "secondary" : "ghost"}
      aria-label={label}
      aria-pressed={active}
      onClick={() => onSelect(view)}
    >
      {view === "active" ? "Active" : "Completed"}
    </Button>
  );
}

function DocumentPanel({ document }: { document: KopperDocument }) {
  const { error, pendingAction, retryLastAction, undo } = useKopperDocument();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<NoteProjectionView>("active");
  const [selection, dispatchSelection] = useReducer(
    selectionReducer,
    initialSelectionState,
  );
  const projections = useMemo(
    () => projectNotes(document, query, view),
    [document, query, view],
  );
  const displayedIds = useMemo(
    () => projections.flatMap(({ notes }) => notes.map(({ id }) => id)),
    [projections],
  );
  const visibleSelection = useMemo(
    () => selectionReducer(selection, { type: "reconcile", displayedIds }),
    [displayedIds, selection],
  );
  const dark = document.appearance.mode === "dark";
  const busy = pendingAction !== null;

  useEffect(() => {
    dispatchSelection({ type: "reconcile", displayedIds });
  }, [displayedIds]);

  useEffect(() => {
    if (visibleSelection.focusedId === null) return;
    const focusedCard = Array.from(
      globalThis.document.querySelectorAll<HTMLElement>("[data-note-id]"),
    ).find(({ dataset }) => dataset.noteId === visibleSelection.focusedId);
    focusedCard?.focus();
  }, [visibleSelection.focusedId]);

  return (
    <div className={cn("contents", dark && "dark")}>
      <Panel>
        <header className="grid gap-2 px-4 pt-4 pb-3 pl-5">
          <SearchField query={query} onQueryChange={setQuery} />
          <div className="flex items-center justify-between gap-2">
            <div
              className="flex rounded-lg border border-border bg-card p-0.5"
              aria-label="Note lifecycle view"
            >
              <ViewButton view="active" current={view} onSelect={setView} />
              <ViewButton view="completed" current={view} onSelect={setView} />
            </div>
            <div className="flex items-center gap-1">
              <AddSectionDialog />
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={busy}
                onClick={() => void undo()}
              >
                Undo
              </Button>
            </div>
          </div>
        </header>

        {error !== null && (
          <GlobalError error={error} retry={retryLastAction} disabled={busy} />
        )}

        <ScrollArea className="min-h-0 flex-1" aria-label="Notes by section">
          <div className="space-y-5 px-4 pt-1 pb-36 pl-5">
            {projections.map((projection) => (
              <SectionGroup
                key={projection.section.id}
                projection={projection}
                view={view}
                displayedIds={displayedIds}
                selection={visibleSelection}
                dispatchSelection={dispatchSelection}
              />
            ))}
            {projections.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No matching notes
              </p>
            )}
          </div>
        </ScrollArea>

        <NoteComposer />
      </Panel>
    </div>
  );
}

export function App() {
  const { document, pendingAction } = useKopperDocument();

  if (pendingAction === "load") return <LoadingState />;
  return <DocumentPanel document={document} />;
}
