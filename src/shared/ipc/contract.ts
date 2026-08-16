import { z } from "zod";

import type { DocumentCommand } from "../domain/commands";
import { KopperDocumentSchema, type KopperDocument } from "../domain/document";
import type { KopperError, Result } from "../domain/errors";

export const IPC_CHANNELS = {
  getDocument: "kopper:document:get",
  documentChanged: "kopper:document:changed",
  executeCommand: "kopper:command:execute",
  undo: "kopper:command:undo",
  copyNotes: "kopper:notes:copy",
} as const;

export const NoteClipboardModeSchema = z.enum(["plain", "markdown-list"]);
export type NoteClipboardMode = z.infer<typeof NoteClipboardModeSchema>;

export const CopyNotesArgumentsSchema = z.tuple([
  z
    .array(z.string().min(1))
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length),
  NoteClipboardModeSchema,
]);

export interface ClipboardCopySuccess {
  copiedCount: number;
}

export type ClipboardCopyResult = Result<ClipboardCopySuccess, KopperError>;

const KopperErrorSchema: z.ZodType<KopperError> = z.strictObject({
  code: z.enum([
    "invalid_document",
    "unsupported_schema",
    "read_failed",
    "write_failed",
    "validation_failed",
    "permission_denied",
    "capture_timeout",
    "capture_failed",
    "nothing_selected",
    "shortcut_conflict",
  ]),
  message: z.string(),
  retryable: z.boolean(),
  recoveryAction: z
    .enum(["retry", "open_settings", "choose_file", "create_store"])
    .optional(),
});

export const DocumentResultSchema: z.ZodType<
  Result<KopperDocument, KopperError>
> = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    value: KopperDocumentSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    error: KopperErrorSchema,
  }),
]);

export function parseDocumentResult(
  input: unknown,
): Result<KopperDocument, KopperError> {
  return DocumentResultSchema.parse(input);
}

export const ClipboardCopyResultSchema: z.ZodType<ClipboardCopyResult> =
  z.discriminatedUnion("ok", [
    z.strictObject({
      ok: z.literal(true),
      value: z.strictObject({ copiedCount: z.int().nonnegative() }),
    }),
    z.strictObject({
      ok: z.literal(false),
      error: KopperErrorSchema,
    }),
  ]);

export function parseClipboardCopyResult(input: unknown): ClipboardCopyResult {
  return ClipboardCopyResultSchema.parse(input);
}

export interface KopperApi {
  getDocument(): Promise<Result<KopperDocument, KopperError>>;
  execute(
    command: DocumentCommand,
  ): Promise<Result<KopperDocument, KopperError>>;
  undo(): Promise<Result<KopperDocument, KopperError>>;
  copyNotes(
    noteIds: string[],
    mode: NoteClipboardMode,
  ): Promise<ClipboardCopyResult>;
  subscribeDocument(listener: (document: KopperDocument) => void): () => void;
}
