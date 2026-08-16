import { z } from "zod";

import type { KopperError, Result } from "./errors";

export type AppearanceMode = "system" | "light" | "dark";

export interface Section {
  id: string;
  title: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotePlacement {
  sectionId: string;
  order: number;
}

export interface Note {
  id: string;
  sectionId: string;
  body: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  previousPlacement: NotePlacement | null;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  version: 1;
  light: Record<string, string>;
  dark: Record<string, string>;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface KopperDocument {
  schemaVersion: 1;
  sections: Section[];
  notes: Note[];
  activeSectionId: string;
  shortcuts: {
    capture: {
      kind: "double-modifier";
      modifier: "shift";
    };
    togglePanel: string;
  };
  window: {
    pinned: boolean;
    bounds: WindowBounds | null;
  };
  appearance: {
    mode: AppearanceMode;
    activeThemeId: string;
  };
  customThemes: ThemeDefinition[];
  draft: {
    body: string;
    sectionId: string;
    updatedAt: string;
  } | null;
}

export type ParseDocumentResult = Result<KopperDocument, KopperError>;

const identifierSchema = z.string().min(1);
const timestampSchema = z.iso.datetime({ offset: false });
const nonNegativeIntegerSchema = z.int().nonnegative();

const SectionSchema: z.ZodType<Section> = z.strictObject({
  id: identifierSchema,
  title: z.string(),
  order: nonNegativeIntegerSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const NotePlacementSchema: z.ZodType<NotePlacement> = z.strictObject({
  sectionId: identifierSchema,
  order: nonNegativeIntegerSchema,
});

const NoteSchema: z.ZodType<Note> = z.strictObject({
  id: identifierSchema,
  sectionId: identifierSchema,
  body: z.string(),
  order: nonNegativeIntegerSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  completedAt: timestampSchema.nullable(),
  previousPlacement: NotePlacementSchema.nullable(),
});

const ThemeDefinitionSchema: z.ZodType<ThemeDefinition> = z.strictObject({
  id: identifierSchema,
  name: z.string(),
  version: z.literal(1),
  light: z.record(z.string(), z.string()),
  dark: z.record(z.string(), z.string()),
});

const WindowBoundsSchema: z.ZodType<WindowBounds> = z.strictObject({
  x: z.int(),
  y: z.int(),
  width: z.int().min(340),
  height: z.int().min(480),
});

export const KopperDocumentSchema: z.ZodType<KopperDocument> = z.strictObject({
  schemaVersion: z.literal(1),
  sections: z.array(SectionSchema).min(1),
  notes: z.array(NoteSchema),
  activeSectionId: identifierSchema,
  shortcuts: z.strictObject({
    capture: z.strictObject({
      kind: z.literal("double-modifier"),
      modifier: z.literal("shift"),
    }),
    togglePanel: z.string().min(1),
  }),
  window: z.strictObject({
    pinned: z.boolean(),
    bounds: WindowBoundsSchema.nullable(),
  }),
  appearance: z.strictObject({
    mode: z.enum(["system", "light", "dark"]),
    activeThemeId: identifierSchema,
  }),
  customThemes: z.array(ThemeDefinitionSchema),
  draft: z
    .strictObject({
      body: z.string(),
      sectionId: identifierSchema,
      updatedAt: timestampSchema,
    })
    .nullable(),
});

const invalidDocument = (message: string): ParseDocumentResult => ({
  ok: false,
  error: {
    code: "invalid_document",
    message,
    retryable: false,
  },
});

function hasUniqueIds(items: ReadonlyArray<{ id: string }>): boolean {
  return new Set(items.map(({ id }) => id)).size === items.length;
}

function hasContiguousOrder(items: ReadonlyArray<{ order: number }>): boolean {
  const orders = items.map(({ order }) => order).sort((left, right) => left - right);
  return orders.every((order, index) => order === index);
}

export function createEmptyDocument(now: Date = new Date()): KopperDocument {
  const timestamp = now.toISOString();
  const inboxId = globalThis.crypto.randomUUID();

  return {
    schemaVersion: 1,
    sections: [
      {
        id: inboxId,
        title: "Inbox",
        order: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    notes: [],
    activeSectionId: inboxId,
    shortcuts: {
      capture: { kind: "double-modifier", modifier: "shift" },
      togglePanel: "CommandOrControl+Shift+Space",
    },
    window: { pinned: false, bounds: null },
    appearance: { mode: "system", activeThemeId: "oxide-ledger" },
    customThemes: [],
    draft: null,
  };
}

export function parseDocument(input: unknown): ParseDocumentResult {
  if (
    typeof input === "object" &&
    input !== null &&
    "schemaVersion" in input &&
    typeof input.schemaVersion === "number" &&
    input.schemaVersion !== 1
  ) {
    return {
      ok: false,
      error: {
        code: "unsupported_schema",
        message: `Schema version ${input.schemaVersion} is not supported.`,
        retryable: false,
      },
    };
  }

  const parsed = KopperDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return invalidDocument("The Kopper document does not match schema version 1.");
  }

  const document = parsed.data;
  if (!hasUniqueIds(document.sections)) {
    return invalidDocument("Section identifiers must be unique.");
  }
  if (!hasUniqueIds(document.notes)) {
    return invalidDocument("Note identifiers must be unique.");
  }
  if (!hasUniqueIds(document.customThemes)) {
    return invalidDocument("Custom theme identifiers must be unique.");
  }
  if (!hasContiguousOrder(document.sections)) {
    return invalidDocument("Section ordering must be contiguous.");
  }

  const sectionIds = new Set(document.sections.map(({ id }) => id));
  if (!sectionIds.has(document.activeSectionId)) {
    return invalidDocument("The active section does not exist.");
  }
  if (document.draft !== null && !sectionIds.has(document.draft.sectionId)) {
    return invalidDocument("The draft section does not exist.");
  }

  const activeNotesBySection = new Map<string, Note[]>();
  for (const note of document.notes) {
    if (note.completedAt === null) {
      if (!sectionIds.has(note.sectionId)) {
        return invalidDocument("An active note references a missing section.");
      }
      if (note.previousPlacement !== null) {
        return invalidDocument("An active note cannot retain a previous placement.");
      }

      const notes = activeNotesBySection.get(note.sectionId) ?? [];
      notes.push(note);
      activeNotesBySection.set(note.sectionId, notes);
    } else if (note.previousPlacement === null) {
      return invalidDocument("A completed note must retain its previous placement.");
    }
  }

  for (const notes of activeNotesBySection.values()) {
    if (!hasContiguousOrder(notes)) {
      return invalidDocument("Active note ordering must be contiguous per section.");
    }
  }

  return { ok: true, value: document };
}
