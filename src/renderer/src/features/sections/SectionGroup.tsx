import { cn } from "../../lib/utils";
import { useKopperDocument } from "../../app/DocumentProvider";
import type {
  NoteProjectionView,
  SectionProjection,
} from "../search/projectNotes";
import { SectionManager } from "./SectionManager";

export interface SectionGroupProps {
  projection: SectionProjection;
  view: NoteProjectionView;
}

export function SectionGroup({ projection, view }: SectionGroupProps) {
  const { document, execute, pendingAction } = useKopperDocument();
  const { section, notes } = projection;
  const active = document.activeSectionId === section.id;

  return (
    <section aria-labelledby={`section-${section.id}`}>
      <div className="mb-2 flex items-center gap-2 font-mono text-[10px] tracking-[0.13em] text-muted-foreground uppercase">
        <h2 id={`section-${section.id}`} className="m-0 text-inherit">
          <button
            type="button"
            className={cn(
              "rounded-sm text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none",
              active && "text-foreground",
            )}
            aria-current={active ? "true" : undefined}
            disabled={pendingAction !== null}
            onClick={() =>
              void execute({ type: "section.activate", sectionId: section.id })
            }
          >
            {section.title}
          </button>
        </h2>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span aria-label={`${notes.length} notes`} className="tracking-normal">
          {String(notes.length).padStart(2, "0")}
        </span>
        <SectionManager section={section} />
      </div>
      <div className="space-y-2">
        {notes.map((note) => (
          <article
            key={note.id}
            className="relative rounded-lg border border-border bg-card py-3 pr-3 pl-10 text-[13px] leading-relaxed text-card-foreground"
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-4 left-4 size-3.5 rounded-full border-2",
                view === "completed"
                  ? "border-[var(--completed)] bg-[var(--completed)]"
                  : "border-[var(--capture)]",
              )}
            />
            <span className="sr-only">
              {view === "completed" ? "Completed" : "Captured"}
            </span>
            <p className="m-0 whitespace-pre-wrap">{note.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
