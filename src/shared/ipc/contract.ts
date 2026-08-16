import { z } from "zod";

import {
  KopperDocumentSchema,
  type KopperDocument,
} from "../domain/document";
import type { KopperError, Result } from "../domain/errors";

export const IPC_CHANNELS = {
  getDocument: "kopper:document:get",
  documentChanged: "kopper:document:changed",
} as const;

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

export interface KopperApi {
  getDocument(): Promise<Result<KopperDocument, KopperError>>;
  subscribeDocument(listener: (document: KopperDocument) => void): () => void;
}
