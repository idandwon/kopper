import type { ReactNode } from "react";

import type { KopperDocument, Note, Section } from "../../../shared/domain/document";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import { cn } from "../lib/utils";
import { useKopperDocument } from "./DocumentProvider";

function notesInSection(document: KopperDocument, section: Section): Note[] {
  return document.notes
    .filter(
      (note) => note.completedAt === null && note.sectionId === section.id,
    )
    .sort((left, right) => {
      const leftOrder = left.previousPlacement?.order ?? left.order;
      const rightOrder = right.previousPlacement?.order ?? right.order;
      return leftOrder - rightOrder;
    });
}

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

function ErrorState({ message }: { message: string }) {
  return (
    <Panel>
      <div className="flex flex-1 items-center p-6">
        <p
          role="alert"
          className="w-full rounded-lg border border-border bg-card p-4 text-sm text-card-foreground"
        >
          {message}
        </p>
      </div>
    </Panel>
  );
}

function NoteCard({ note }: { note: Note }) {
  const completed = note.completedAt !== null;

  return (
    <article className="relative rounded-lg border border-border bg-card py-3 pr-3 pl-10 text-[13px] leading-relaxed text-card-foreground">
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-4 left-4 size-3.5 rounded-full border-2",
          completed
            ? "border-[var(--completed)] bg-[var(--completed)]"
            : "border-[var(--capture)]",
        )}
      />
      <span className="sr-only">{completed ? "Completed" : "Captured"}</span>
      <p className="m-0 whitespace-pre-wrap">{note.body}</p>
    </article>
  );
}

function DocumentShell({ document }: { document: KopperDocument }) {
  const sections = [...document.sections].sort((left, right) => left.order - right.order);
  const dark = document.appearance.mode === "dark";

  return (
    <div className={cn("contents", dark && "dark")}>
      <Panel>
        <header className="flex items-center px-4 pt-4 pb-3 pl-5">
          <div className="relative w-full">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            >
              ⌕
            </span>
            <Input
              type="search"
              aria-label="Search notes"
              readOnly
              placeholder="Search notes"
              className="h-10 rounded-lg bg-card pr-14 pl-9 text-sm"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ⌘ K
            </kbd>
          </div>
        </header>

        <ScrollArea className="min-h-0 flex-1" aria-label="Notes by section">
          <div className="space-y-5 px-4 pt-1 pb-24 pl-5">
            {sections.map((section) => {
              const notes = notesInSection(document, section);

              return (
                <section key={section.id} aria-labelledby={`section-${section.id}`}>
                  <div className="mb-2 flex items-center gap-2 font-mono text-[10px] tracking-[0.13em] text-muted-foreground uppercase">
                    <h2 id={`section-${section.id}`} className="m-0 text-inherit">
                      {section.title}
                    </h2>
                    <span className="h-px flex-1 bg-border" aria-hidden="true" />
                    <span aria-label={`${notes.length} notes`} className="tracking-normal">
                      {String(notes.length).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {notes.map((note) => (
                      <NoteCard key={note.id} note={note} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </ScrollArea>

        <div className="absolute right-4 bottom-4 left-5 rounded-xl border border-border bg-card p-2">
          <Input
            aria-label="Add a note or prompt"
            placeholder="Add a note or prompt"
            disabled
            className="h-10 border-0 bg-card px-3 text-sm shadow-none disabled:opacity-70"
          />
        </div>
      </Panel>
    </div>
  );
}

export function App() {
  const { document, error, pendingAction } = useKopperDocument();

  if (pendingAction === "load") return <LoadingState />;
  if (error !== null) return <ErrorState message={error.message} />;
  return <DocumentShell document={document} />;
}
