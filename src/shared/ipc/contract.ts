import { z } from "zod";

import type { DocumentCommand } from "../domain/commands";
import {
  KopperDocumentSchema,
  ShortcutPreferencesSchema,
  ThemeDefinitionSchema,
  type KopperDocument,
  type ShortcutPreferences,
  type ThemeDefinition,
} from "../domain/document";
import type { KopperError, Result } from "../domain/errors";
import {
  PermissionStateSchema,
  type PermissionState,
} from "../permissions/permissionState";

export const IPC_CHANNELS = {
  getDocument: "kopper:document:get",
  documentChanged: "kopper:document:changed",
  executeCommand: "kopper:command:execute",
  undo: "kopper:command:undo",
  copyNotes: "kopper:notes:copy",
  openEditorWindow: "kopper:editor:open",
  exportData: "kopper:data:export",
  chooseDataImport: "kopper:data:import:choose",
  confirmDataImport: "kopper:data:import:confirm",
  exportRecoveryBytes: "kopper:recovery:export",
  createNewStore: "kopper:recovery:create",
  getDataPath: "kopper:data:path",
  importTheme: "kopper:theme:import",
  exportTheme: "kopper:theme:export",
  getNativeAppearance: "kopper:appearance:native:get",
  nativeAppearanceChanged: "kopper:appearance:native:changed",
  getAccessibilityPermission: "kopper:permission:get",
  repairAccessibilityPermission: "kopper:permission:repair",
  getAccessibilitySession: "kopper:permission:session:get",
  openAccessibilitySettings: "kopper:permission:settings:open",
  continueWithoutCapture: "kopper:onboarding:continue-without-capture",
  accessibilityPermissionChanged: "kopper:permission:changed",
  captureOutcome: "kopper:capture:outcome",
  requestCapture: "kopper:capture:request",
  validateShortcuts: "kopper:shortcuts:validate",
  saveShortcuts: "kopper:shortcuts:save",
  setPinned: "kopper:window:pin",
  hidePanel: "kopper:window:hide",
  openSettings: "kopper:settings:open",
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

const ThemeContrastFailureSchema = z.strictObject({
  mode: z.enum(["light", "dark"]),
  backgroundToken: z.enum([
    "background",
    "card",
    "popover",
    "primary",
    "accent",
  ]),
  foregroundToken: z.enum([
    "foreground",
    "card-foreground",
    "popover-foreground",
    "primary-foreground",
    "accent-foreground",
  ]),
  ratio: z.number().finite().min(1).max(21),
});

export const KopperErrorSchema: z.ZodType<KopperError> = z.strictObject({
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
  failures: z.array(ThemeContrastFailureSchema).optional(),
  opaqueBackgroundModes: z.array(z.enum(["light", "dark"])).optional(),
});

export type CaptureOutcome =
  | { status: "captured"; noteId: string }
  | { status: "empty" }
  | { status: "failed"; error: KopperError };

export const CaptureOutcomeSchema: z.ZodType<CaptureOutcome> =
  z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("captured"), noteId: z.uuid() }),
    z.strictObject({ status: z.literal("empty") }),
    z.strictObject({ status: z.literal("failed"), error: KopperErrorSchema }),
  ]);

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

export type FileOperationSuccess =
  | { cancelled: true }
  | { cancelled: false; fileName: string };

export type FileOperationResult = Result<FileOperationSuccess, KopperError>;

export interface DataImportPreview {
  token: string;
  fileName: string;
  noteCount: number;
  sectionCount: number;
}

export const FileOperationResultSchema: z.ZodType<FileOperationResult> =
  z.discriminatedUnion("ok", [
    z.strictObject({
      ok: z.literal(true),
      value: z.discriminatedUnion("cancelled", [
        z.strictObject({ cancelled: z.literal(true) }),
        z.strictObject({
          cancelled: z.literal(false),
          fileName: z.string().min(1),
        }),
      ]),
    }),
    z.strictObject({ ok: z.literal(false), error: KopperErrorSchema }),
  ]);

const DataImportPreviewSchema: z.ZodType<DataImportPreview> = z.strictObject({
  token: z.uuid(),
  fileName: z.string().min(1),
  noteCount: z.int().nonnegative(),
  sectionCount: z.int().positive(),
});

export const DataImportPreviewResultSchema: z.ZodType<
  Result<DataImportPreview | null, KopperError>
> = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    value: DataImportPreviewSchema.nullable(),
  }),
  z.strictObject({ ok: z.literal(false), error: KopperErrorSchema }),
]);

export const DataPathResultSchema: z.ZodType<Result<string, KopperError>> =
  z.discriminatedUnion("ok", [
    z.strictObject({ ok: z.literal(true), value: z.string().min(1) }),
    z.strictObject({ ok: z.literal(false), error: KopperErrorSchema }),
  ]);

export const OpenEditorResultSchema: z.ZodType<
  Result<{ noteId: string }, KopperError>
> = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    value: z.strictObject({ noteId: z.string().min(1) }),
  }),
  z.strictObject({ ok: z.literal(false), error: KopperErrorSchema }),
]);

const NormalizedThemeTokenSchema = z.enum([
  "radius",
  "capture",
  "organized",
  "completed",
]);
const NormalizedThemeTokensSchema = z
  .array(NormalizedThemeTokenSchema)
  .max(4)
  .refine((tokens) => new Set(tokens).size === tokens.length);

export interface ThemeImportPreview {
  theme: ThemeDefinition;
  normalizedTokens: {
    light: Array<"radius" | "capture" | "organized" | "completed">;
    dark: Array<"radius" | "capture" | "organized" | "completed">;
  };
}

export const ThemeImportResultSchema: z.ZodType<
  Result<ThemeImportPreview | null, KopperError>
> = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    value: z
      .strictObject({
        theme: ThemeDefinitionSchema,
        normalizedTokens: z.strictObject({
          light: NormalizedThemeTokensSchema,
          dark: NormalizedThemeTokensSchema,
        }),
      })
      .nullable(),
  }),
  z.strictObject({ ok: z.literal(false), error: KopperErrorSchema }),
]);

export const ThemeExportResultSchema: z.ZodType<
  Result<{ path: string } | null, KopperError>
> = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    value: z.strictObject({ path: z.string().min(1) }).nullable(),
  }),
  z.strictObject({ ok: z.literal(false), error: KopperErrorSchema }),
]);

export const NativeAppearanceSchema = z.boolean();
export const NativeAppearanceResultSchema: z.ZodType<
  Result<boolean, KopperError>
> = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), value: NativeAppearanceSchema }),
  z.strictObject({ ok: z.literal(false), error: KopperErrorSchema }),
]);

export const PermissionPromptArgumentsSchema = z.tuple([z.boolean()]);
export const PermissionResultSchema: z.ZodType<
  Result<PermissionState, KopperError>
> = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), value: PermissionStateSchema }),
  z.strictObject({ ok: z.literal(false), error: KopperErrorSchema }),
]);

export interface AccessibilitySessionState {
  continuedWithoutCapture: boolean;
}

export const AccessibilitySessionResultSchema: z.ZodType<
  Result<AccessibilitySessionState, KopperError>
> = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    value: z.strictObject({ continuedWithoutCapture: z.boolean() }),
  }),
  z.strictObject({ ok: z.literal(false), error: KopperErrorSchema }),
]);

export interface PermissionActionSuccess {
  acknowledged: true;
}

export const PermissionActionResultSchema: z.ZodType<
  Result<PermissionActionSuccess, KopperError>
> = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    value: z.strictObject({ acknowledged: z.literal(true) }),
  }),
  z.strictObject({ ok: z.literal(false), error: KopperErrorSchema }),
]);

export const SingleIdentifierArgumentsSchema = z.tuple([z.string().min(1)]);
export const ImportTokenArgumentsSchema = z.tuple([z.uuid()]);
export const ShortcutPreferencesArgumentsSchema = z.tuple([
  ShortcutPreferencesSchema,
]);
export const SetPinnedArgumentsSchema = z.tuple([z.boolean()]);

export const ShortcutValidationResultSchema: z.ZodType<
  Result<{ valid: true }, KopperError>
> = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    value: z.strictObject({ valid: z.literal(true) }),
  }),
  z.strictObject({ ok: z.literal(false), error: KopperErrorSchema }),
]);

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
  openEditorWindow(
    noteId: string,
  ): Promise<Result<{ noteId: string }, KopperError>>;
  exportData(): Promise<FileOperationResult>;
  chooseDataImport(): Promise<Result<DataImportPreview | null, KopperError>>;
  confirmDataImport(
    token: string,
  ): Promise<Result<KopperDocument, KopperError>>;
  exportRecoveryBytes(): Promise<FileOperationResult>;
  createNewStore(): Promise<Result<KopperDocument, KopperError>>;
  getDataPath(): Promise<Result<string, KopperError>>;
  importTheme(): Promise<Result<ThemeImportPreview | null, KopperError>>;
  exportTheme(
    themeId: string,
  ): Promise<Result<{ path: string } | null, KopperError>>;
  getNativeAppearance(): Promise<Result<boolean, KopperError>>;
  onNativeAppearanceChanged(
    listener: (useDarkColors: boolean) => void,
  ): () => void;
  getAccessibilityPermission(
    prompt: boolean,
  ): Promise<Result<PermissionState, KopperError>>;
  repairAccessibilityPermission(): Promise<
    Result<PermissionState, KopperError>
  >;
  getAccessibilitySession(): Promise<
    Result<AccessibilitySessionState, KopperError>
  >;
  openAccessibilitySettings(): Promise<
    Result<PermissionActionSuccess, KopperError>
  >;
  continueWithoutCapture(): Promise<
    Result<PermissionActionSuccess, KopperError>
  >;
  onAccessibilityPermissionChanged(
    listener: (state: PermissionState) => void,
  ): () => void;
  onCaptureOutcome(listener: (outcome: CaptureOutcome) => void): () => void;
  requestCapture(): Promise<CaptureOutcome>;
  validateShortcuts(
    preferences: ShortcutPreferences,
  ): Promise<Result<{ valid: true }, KopperError>>;
  saveShortcuts(
    preferences: ShortcutPreferences,
  ): Promise<Result<KopperDocument, KopperError>>;
  setPinned(pinned: boolean): Promise<Result<KopperDocument, KopperError>>;
  hidePanel(): Promise<void>;
  onOpenSettings(listener: () => void): () => void;
  subscribeDocument(listener: (document: KopperDocument) => void): () => void;
}
