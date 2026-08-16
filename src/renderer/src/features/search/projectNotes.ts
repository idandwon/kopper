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
  const orderedSections = [...document.sections].sort(
    (left, right) => left.order - right.order,
  );
  const sectionIds = new Set(orderedSections.map(({ id }) => id));
  const fallbackSectionId = orderedSections[0].id;

  return orderedSections
    .map((section): SectionProjection => {
      const notes = document.notes
        .filter((note) => {
          if ((note.completedAt !== null) !== completed) return false;
          const savedSectionId =
            note.previousPlacement?.sectionId ?? note.sectionId;
          const placementSectionId = completed
            ? sectionIds.has(savedSectionId)
              ? savedSectionId
              : fallbackSectionId
            : note.sectionId;
          return (
            placementSectionId === section.id &&
            (normalizedQuery.length === 0 ||
              note.body.toLocaleLowerCase().includes(normalizedQuery))
          );
        })
        .sort((left, right) => {
          if (completed) {
            return (right.completedAt ?? "").localeCompare(left.completedAt ?? "");
          }
          return left.order - right.order;
        });

      return { section, notes };
    })
    .filter(({ notes }) => normalizedQuery.length === 0 || notes.length > 0);
}
