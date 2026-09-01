import { z } from "zod";

import {
  parseDocument,
  CaptureShortcutSchema,
  ThemeDefinitionSchema,
  WindowBoundsSchema,
  type CaptureShortcut,
  type KopperDocument,
  type Note,
  type Section,
  type ThemeDefinition,
  type WindowBounds,
} from "./document";
import type { KopperError, Result } from "./errors";
import {
  isBundledThemeId,
  SHADCN_DEFAULT_THEME,
} from "../theme/presets";
import { validatePersistedCustomTheme } from "../theme/validatePersistedTheme";

export type DocumentCommand =
  | { type: "note.add"; id?: string; sectionId: string; body: string }
  | { type: "note.edit"; noteId: string; body: string }
  | {
      type: "note.move";
      noteIds: string[];
      destinationSectionId: string;
      destinationOrder: number;
    }
  | { type: "note.complete"; noteIds: string[] }
  | { type: "note.restore"; noteIds: string[] }
  | { type: "note.delete"; noteIds: string[] }
  | { type: "note.merge"; noteIds: string[] }
  | { type: "section.add"; title: string }
  | { type: "section.rename"; sectionId: string; title: string }
  | {
      type: "section.reorder";
      sectionId: string;
      destinationOrder: number;
    }
  | {
      type: "section.delete";
      sectionId: string;
      destinationSectionId?: string;
    }
  | { type: "section.activate"; sectionId: string }
  | { type: "draft.set"; body: string; sectionId: string }
  | { type: "draft.clear" }
  | { type: "appearance.setMode"; mode: "system" | "light" | "dark" }
  | { type: "appearance.setActiveTheme"; themeId: string }
  | { type: "appearance.upsertCustomTheme"; theme: ThemeDefinition }
  | { type: "appearance.deleteCustomTheme"; themeId: string }
  | { type: "shortcuts.setCapture"; capture: CaptureShortcut }
  | { type: "shortcuts.setTogglePanel"; accelerator: string }
  | { type: "window.setPinned"; pinned: boolean }
  | { type: "window.setBounds"; bounds: WindowBounds | null };

export interface CommandContext {
  now(): string;
  createId(): string;
}

const identifierSchema = z.string().min(1);
const nonWhitespaceSchema = z.string().refine((value) => value.trim().length > 0);
const destinationOrderSchema = z.int().nonnegative();
const noteIdsSchema = z
  .array(identifierSchema)
  .min(1)
  .refine((ids) => new Set(ids).size === ids.length);

export const DocumentCommandSchema: z.ZodType<DocumentCommand> =
  z.discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("note.add"),
      id: z.uuid().optional(),
      sectionId: identifierSchema,
      body: nonWhitespaceSchema,
    }),
    z.strictObject({
      type: z.literal("note.edit"),
      noteId: identifierSchema,
      body: nonWhitespaceSchema,
    }),
    z.strictObject({
      type: z.literal("note.move"),
      noteIds: noteIdsSchema,
      destinationSectionId: identifierSchema,
      destinationOrder: destinationOrderSchema,
    }),
    z.strictObject({
      type: z.literal("note.complete"),
      noteIds: noteIdsSchema,
    }),
    z.strictObject({
      type: z.literal("note.restore"),
      noteIds: noteIdsSchema,
    }),
    z.strictObject({
      type: z.literal("note.delete"),
      noteIds: noteIdsSchema,
    }),
    z.strictObject({
      type: z.literal("note.merge"),
      noteIds: noteIdsSchema.min(2),
    }),
    z.strictObject({
      type: z.literal("section.add"),
      title: nonWhitespaceSchema,
    }),
    z.strictObject({
      type: z.literal("section.rename"),
      sectionId: identifierSchema,
      title: nonWhitespaceSchema,
    }),
    z.strictObject({
      type: z.literal("section.reorder"),
      sectionId: identifierSchema,
      destinationOrder: destinationOrderSchema,
    }),
    z.strictObject({
      type: z.literal("section.delete"),
      sectionId: identifierSchema,
      destinationSectionId: identifierSchema.optional(),
    }),
    z.strictObject({
      type: z.literal("section.activate"),
      sectionId: identifierSchema,
    }),
    z.strictObject({
      type: z.literal("draft.set"),
      body: z.string(),
      sectionId: identifierSchema,
    }),
    z.strictObject({ type: z.literal("draft.clear") }),
    z.strictObject({
      type: z.literal("appearance.setMode"),
      mode: z.enum(["system", "light", "dark"]),
    }),
    z.strictObject({
      type: z.literal("appearance.setActiveTheme"),
      themeId: identifierSchema,
    }),
    z.strictObject({
      type: z.literal("appearance.upsertCustomTheme"),
      theme: ThemeDefinitionSchema,
    }),
    z.strictObject({
      type: z.literal("appearance.deleteCustomTheme"),
      themeId: identifierSchema,
    }),
    z.strictObject({
      type: z.literal("shortcuts.setCapture"),
      capture: CaptureShortcutSchema,
    }),
    z.strictObject({
      type: z.literal("shortcuts.setTogglePanel"),
      accelerator: z.string().trim().min(1),
    }),
    z.strictObject({
      type: z.literal("window.setPinned"),
      pinned: z.boolean(),
    }),
    z.strictObject({
      type: z.literal("window.setBounds"),
      bounds: WindowBoundsSchema.nullable(),
    }),
  ]);

type NoteCommand = Extract<DocumentCommand, { type: `note.${string}` }>;
type SectionCommand = Extract<DocumentCommand, { type: `section.${string}` }>;
type DraftCommand = Extract<DocumentCommand, { type: `draft.${string}` }>;
type AppearanceCommand = Extract<
  DocumentCommand,
  { type: `appearance.${string}` }
>;
type ShortcutCommand = Extract<
  DocumentCommand,
  { type: `shortcuts.${string}` }
>;
type WindowCommand = Extract<DocumentCommand, { type: `window.${string}` }>;

function validationError(message: string): Result<never, KopperError> {
  return {
    ok: false,
    error: {
      code: "validation_failed",
      message,
      retryable: false,
    },
  };
}

function orderedSections(document: KopperDocument): Section[] {
  return [...document.sections].sort((left, right) => left.order - right.order);
}

function orderedActiveNotes(
  document: KopperDocument,
  sectionId: string,
  excluding: ReadonlySet<string> = new Set(),
): Note[] {
  return document.notes
    .filter(
      (note) =>
        note.completedAt === null &&
        note.sectionId === sectionId &&
        !excluding.has(note.id),
    )
    .sort((left, right) => left.order - right.order);
}

function normalizeOrders(notes: Note[], timestamp: string): void {
  notes.forEach((note, order) => {
    if (note.order !== order) {
      note.order = order;
      note.updatedAt = timestamp;
    }
  });
}

function findNotes(
  document: KopperDocument,
  noteIds: string[],
): Result<Note[], KopperError> {
  const notesById = new Map(document.notes.map((note) => [note.id, note]));
  const notes = noteIds.map((id) => notesById.get(id));
  if (notes.some((note) => note === undefined)) {
    return validationError("Every selected note must exist.");
  }

  return { ok: true, value: notes as Note[] };
}

function requireSection(
  document: KopperDocument,
  sectionId: string,
): Result<Section, KopperError> {
  const section = document.sections.find(({ id }) => id === sectionId);
  return section === undefined
    ? validationError("The selected section does not exist.")
    : { ok: true, value: section };
}

function applyNoteCommand(
  document: KopperDocument,
  command: NoteCommand,
  context: CommandContext,
): Result<void, KopperError> {
  const timestamp = context.now();

  switch (command.type) {
    case "note.add": {
      const section = requireSection(document, command.sectionId);
      if (!section.ok) return section;
      const id = command.id ?? context.createId();
      if (document.notes.some((note) => note.id === id)) {
        return validationError("The note identifier is already in use.");
      }

      document.notes.push({
        id,
        sectionId: command.sectionId,
        body: command.body,
        order: orderedActiveNotes(document, command.sectionId).length,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
        previousPlacement: null,
      });
      return { ok: true, value: undefined };
    }

    case "note.edit": {
      const note = document.notes.find(({ id }) => id === command.noteId);
      if (note === undefined) return validationError("The note does not exist.");
      note.body = command.body;
      note.updatedAt = timestamp;
      return { ok: true, value: undefined };
    }

    case "note.move": {
      const destination = requireSection(document, command.destinationSectionId);
      if (!destination.ok) return destination;
      const selectedResult = findNotes(document, command.noteIds);
      if (!selectedResult.ok) return selectedResult;
      const selected = selectedResult.value;
      if (selected.some((note) => note.completedAt !== null)) {
        return validationError("Only active notes can be moved.");
      }

      const selectedIds = new Set(command.noteIds);
      const affectedSections = new Set(selected.map((note) => note.sectionId));
      affectedSections.add(command.destinationSectionId);
      const destinationNotes = orderedActiveNotes(
        document,
        command.destinationSectionId,
        selectedIds,
      );
      const insertionOrder = Math.min(
        command.destinationOrder,
        destinationNotes.length,
      );
      selected.forEach((note) => {
        note.sectionId = command.destinationSectionId;
        note.updatedAt = timestamp;
      });
      destinationNotes.splice(insertionOrder, 0, ...selected);

      for (const sectionId of affectedSections) {
        normalizeOrders(
          sectionId === command.destinationSectionId
            ? destinationNotes
            : orderedActiveNotes(document, sectionId, selectedIds),
          timestamp,
        );
      }
      return { ok: true, value: undefined };
    }

    case "note.complete": {
      const selectedResult = findNotes(document, command.noteIds);
      if (!selectedResult.ok) return selectedResult;
      const selected = selectedResult.value;
      if (selected.some((note) => note.completedAt !== null)) {
        return validationError("Only active notes can be completed.");
      }

      const affectedSections = new Set<string>();
      for (const note of selected) {
        affectedSections.add(note.sectionId);
        note.previousPlacement = {
          sectionId: note.sectionId,
          order: note.order,
        };
        note.completedAt = timestamp;
        note.updatedAt = timestamp;
      }
      for (const sectionId of affectedSections) {
        normalizeOrders(orderedActiveNotes(document, sectionId), timestamp);
      }
      return { ok: true, value: undefined };
    }

    case "note.restore": {
      const selectedResult = findNotes(document, command.noteIds);
      if (!selectedResult.ok) return selectedResult;
      const selected = selectedResult.value;
      if (
        selected.some(
          (note) => note.completedAt === null || note.previousPlacement === null,
        )
      ) {
        return validationError("Only completed notes can be restored.");
      }

      const existingSectionIds = new Set(
        document.sections.map((section) => section.id),
      );
      const fallbackSection = orderedSections(document)[0];
      const commandOrder = new Map(
        command.noteIds.map((noteId, index) => [noteId, index]),
      );
      const groups = new Map<string, Note[]>();
      for (const note of selected) {
        const previousPlacement = note.previousPlacement;
        if (previousPlacement === null) continue;
        const targetSectionId = existingSectionIds.has(previousPlacement.sectionId)
          ? previousPlacement.sectionId
          : fallbackSection.id;
        const group = groups.get(targetSectionId) ?? [];
        group.push(note);
        groups.set(targetSectionId, group);
      }

      for (const [sectionId, group] of groups) {
        const activeNotes = orderedActiveNotes(document, sectionId);
        group.sort((left, right) => {
          const placementDifference =
            (left.previousPlacement?.order ?? 0) -
            (right.previousPlacement?.order ?? 0);
          return (
            placementDifference ||
            (commandOrder.get(left.id) ?? 0) -
              (commandOrder.get(right.id) ?? 0)
          );
        });

        let lastInsertionOrder = -1;
        for (const note of group) {
          const savedOrder = note.previousPlacement?.order ?? activeNotes.length;
          const insertionOrder = Math.min(
            Math.max(savedOrder, lastInsertionOrder + 1),
            activeNotes.length,
          );
          note.sectionId = sectionId;
          note.completedAt = null;
          note.previousPlacement = null;
          note.updatedAt = timestamp;
          activeNotes.splice(insertionOrder, 0, note);
          lastInsertionOrder = insertionOrder;
        }
        normalizeOrders(activeNotes, timestamp);
      }
      return { ok: true, value: undefined };
    }

    case "note.delete": {
      const selectedResult = findNotes(document, command.noteIds);
      if (!selectedResult.ok) return selectedResult;
      const selectedIds = new Set(command.noteIds);
      const affectedSections = new Set(
        selectedResult.value
          .filter((note) => note.completedAt === null)
          .map((note) => note.sectionId),
      );
      document.notes = document.notes.filter((note) => !selectedIds.has(note.id));
      for (const sectionId of affectedSections) {
        normalizeOrders(orderedActiveNotes(document, sectionId), timestamp);
      }
      return { ok: true, value: undefined };
    }

    case "note.merge": {
      const selectedResult = findNotes(document, command.noteIds);
      if (!selectedResult.ok) return selectedResult;
      const selected = selectedResult.value;
      if (selected.some((note) => note.completedAt !== null)) {
        return validationError("Only active notes can be merged.");
      }

      const retained = selected[0];
      const removedIds = new Set(command.noteIds.slice(1));
      const affectedSections = new Set(selected.map((note) => note.sectionId));
      retained.body = selected.map((note) => note.body.trim()).join("\n\n");
      retained.updatedAt = timestamp;
      document.notes = document.notes.filter((note) => !removedIds.has(note.id));
      for (const sectionId of affectedSections) {
        normalizeOrders(orderedActiveNotes(document, sectionId), timestamp);
      }
      return { ok: true, value: undefined };
    }
  }
}

function applySectionCommand(
  document: KopperDocument,
  command: SectionCommand,
  context: CommandContext,
): Result<void, KopperError> {
  const timestamp = context.now();

  switch (command.type) {
    case "section.add": {
      const id = context.createId();
      if (document.sections.some((section) => section.id === id)) {
        return validationError("The section identifier is already in use.");
      }
      document.sections.push({
        id,
        title: command.title.trim(),
        order: document.sections.length,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return { ok: true, value: undefined };
    }

    case "section.rename": {
      const section = requireSection(document, command.sectionId);
      if (!section.ok) return section;
      section.value.title = command.title.trim();
      section.value.updatedAt = timestamp;
      return { ok: true, value: undefined };
    }

    case "section.reorder": {
      const section = requireSection(document, command.sectionId);
      if (!section.ok) return section;
      const sections = orderedSections(document).filter(
        ({ id }) => id !== command.sectionId,
      );
      sections.splice(
        Math.min(command.destinationOrder, sections.length),
        0,
        section.value,
      );
      sections.forEach((item, order) => {
        if (item.order !== order) {
          item.order = order;
          item.updatedAt = timestamp;
        }
      });
      section.value.updatedAt = timestamp;
      document.sections = sections;
      return { ok: true, value: undefined };
    }

    case "section.delete": {
      const section = requireSection(document, command.sectionId);
      if (!section.ok) return section;
      if (document.sections.length === 1) {
        return validationError("The final section cannot be deleted.");
      }
      if (command.destinationSectionId === command.sectionId) {
        return validationError("A deleted section cannot be its own destination.");
      }

      const destination =
        command.destinationSectionId === undefined
          ? undefined
          : requireSection(document, command.destinationSectionId);
      if (destination !== undefined && !destination.ok) return destination;
      const referencedNotes = document.notes.filter(
        (note) =>
          note.sectionId === command.sectionId ||
          note.previousPlacement?.sectionId === command.sectionId,
      );
      const draftReferencesSection =
        document.draft?.sectionId === command.sectionId;
      if (
        (referencedNotes.length > 0 || draftReferencesSection) &&
        destination === undefined
      ) {
        return validationError(
          "A destination is required when deleting a referenced section.",
        );
      }

      if (destination?.ok) {
        const activeDestinationNotes = orderedActiveNotes(
          document,
          destination.value.id,
        );
        const movedActiveNotes = orderedActiveNotes(document, command.sectionId);
        for (const note of movedActiveNotes) {
          note.sectionId = destination.value.id;
          note.updatedAt = timestamp;
        }
        normalizeOrders(
          [...activeDestinationNotes, ...movedActiveNotes],
          timestamp,
        );

        for (const note of document.notes) {
          let changed = false;
          if (note.completedAt !== null && note.sectionId === command.sectionId) {
            note.sectionId = destination.value.id;
            changed = true;
          }
          if (note.previousPlacement?.sectionId === command.sectionId) {
            note.previousPlacement.sectionId = destination.value.id;
            changed = true;
          }
          if (changed) note.updatedAt = timestamp;
        }
        if (draftReferencesSection && document.draft !== null) {
          document.draft.sectionId = destination.value.id;
          document.draft.updatedAt = timestamp;
        }
      }

      document.sections = orderedSections(document)
        .filter(({ id }) => id !== command.sectionId)
        .map((item, order) => ({
          ...item,
          order,
          updatedAt: item.order === order ? item.updatedAt : timestamp,
        }));
      if (document.activeSectionId === command.sectionId) {
        document.activeSectionId = document.sections[0].id;
      }
      return { ok: true, value: undefined };
    }

    case "section.activate": {
      const section = requireSection(document, command.sectionId);
      if (!section.ok) return section;
      document.activeSectionId = section.value.id;
      return { ok: true, value: undefined };
    }
  }
}

function applyDraftCommand(
  document: KopperDocument,
  command: DraftCommand,
  context: CommandContext,
): Result<void, KopperError> {
  switch (command.type) {
    case "draft.set": {
      const section = requireSection(document, command.sectionId);
      if (!section.ok) return section;
      document.draft = {
        body: command.body,
        sectionId: command.sectionId,
        updatedAt: context.now(),
      };
      return { ok: true, value: undefined };
    }
    case "draft.clear":
      document.draft = null;
      return { ok: true, value: undefined };
  }
}

function applyPreferenceCommand(
  document: KopperDocument,
  command: ShortcutCommand | WindowCommand,
): Result<void, KopperError> {
  switch (command.type) {
    case "shortcuts.setCapture":
      document.shortcuts.capture = structuredClone(command.capture);
      return { ok: true, value: undefined };
    case "shortcuts.setTogglePanel":
      document.shortcuts.togglePanel = command.accelerator.trim();
      return { ok: true, value: undefined };
    case "window.setPinned":
      document.window.pinned = command.pinned;
      return { ok: true, value: undefined };
    case "window.setBounds":
      document.window.bounds = structuredClone(command.bounds);
      return { ok: true, value: undefined };
  }
}

function applyAppearanceCommand(
  document: KopperDocument,
  command: AppearanceCommand,
): Result<void, KopperError> {
  switch (command.type) {
    case "appearance.setMode":
      document.appearance.mode = command.mode;
      return { ok: true, value: undefined };

    case "appearance.setActiveTheme": {
      const exists =
        isBundledThemeId(command.themeId) ||
        document.customThemes.some(({ id }) => id === command.themeId);
      if (!exists) return validationError("The selected theme does not exist.");
      document.appearance.activeThemeId = command.themeId;
      return { ok: true, value: undefined };
    }

    case "appearance.upsertCustomTheme": {
      const validTheme = validatePersistedCustomTheme(command.theme);
      if (!validTheme.ok) return validTheme;

      const index = document.customThemes.findIndex(
        ({ id }) => id === command.theme.id,
      );
      if (index === -1) document.customThemes.push(command.theme);
      else document.customThemes[index] = command.theme;
      return { ok: true, value: undefined };
    }

    case "appearance.deleteCustomTheme": {
      if (isBundledThemeId(command.themeId)) {
        return validationError("Bundled themes cannot be deleted.");
      }
      const index = document.customThemes.findIndex(
        ({ id }) => id === command.themeId,
      );
      if (index === -1) return validationError("The custom theme does not exist.");
      document.customThemes.splice(index, 1);
      if (document.appearance.activeThemeId === command.themeId) {
        document.appearance.activeThemeId = SHADCN_DEFAULT_THEME.id;
      }
      return { ok: true, value: undefined };
    }
  }
}

export function applyDocumentCommand(
  document: KopperDocument,
  command: unknown,
  context: CommandContext,
): Result<KopperDocument, KopperError> {
  const parsedCommand = DocumentCommandSchema.safeParse(command);
  if (!parsedCommand.success) {
    return validationError("The document command is invalid.");
  }

  const next = structuredClone(document);
  const parsed = parsedCommand.data;
  const transition = parsed.type.startsWith("note.")
    ? applyNoteCommand(next, parsed as NoteCommand, context)
    : parsed.type.startsWith("section.")
      ? applySectionCommand(next, parsed as SectionCommand, context)
      : parsed.type.startsWith("draft.")
        ? applyDraftCommand(next, parsed as DraftCommand, context)
        : parsed.type.startsWith("appearance.")
          ? applyAppearanceCommand(next, parsed as AppearanceCommand)
          : applyPreferenceCommand(
              next,
              parsed as ShortcutCommand | WindowCommand,
            );
  if (!transition.ok) return transition;

  return parseDocument(next);
}

const undoableTypes = new Set<DocumentCommand["type"]>([
  "note.edit",
  "note.move",
  "note.complete",
  "note.restore",
  "note.delete",
  "note.merge",
  "section.reorder",
  "section.delete",
]);

export function isUndoable(command: DocumentCommand): boolean {
  return undoableTypes.has(command.type);
}
