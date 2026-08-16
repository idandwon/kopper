import type {
  KopperDocument,
  Note,
  Section,
} from "../../../../shared/domain/document";

export interface SectionProjection {
  section: Section;
  notes: Note[];
}

export type NoteProjectionView = "active" | "completed";

export function projectNotes(
  document: KopperDocument,
  query: string,
  view: NoteProjectionView,
): SectionProjection[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const completed = view === "completed";

  return [...document.sections]
    .sort((left, right) => left.order - right.order)
    .map((section): SectionProjection => {
      const notes = document.notes
        .filter((note) => {
          if ((note.completedAt !== null) !== completed) return false;
          const placementSectionId = completed
            ? (note.previousPlacement?.sectionId ?? note.sectionId)
            : note.sectionId;
          return (
            placementSectionId === section.id &&
            (normalizedQuery.length === 0 ||
              note.body.toLocaleLowerCase().includes(normalizedQuery))
          );
        })
        .sort((left, right) => {
          const leftOrder = completed
            ? (left.previousPlacement?.order ?? left.order)
            : left.order;
          const rightOrder = completed
            ? (right.previousPlacement?.order ?? right.order)
            : right.order;
          return leftOrder - rightOrder;
        });

      return { section, notes };
    })
    .filter(({ notes }) => normalizedQuery.length === 0 || notes.length > 0);
}
