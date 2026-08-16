import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { z } from "zod";

import {
  DocumentCommandSchema,
  type DocumentCommand,
} from "../../shared/domain/commands";
import type {
  KopperDocument,
  ShortcutPreferences,
  ThemeDefinition,
} from "../../shared/domain/document";
import type { KopperError, Result } from "../../shared/domain/errors";
import {
  AccessibilitySessionResultSchema,
  CopyNotesArgumentsSchema,
  DataImportPreviewResultSchema,
  DataPathResultSchema,
  DocumentResultSchema,
  FileOperationResultSchema,
  ImportTokenArgumentsSchema,
  IPC_CHANNELS,
  NativeAppearanceResultSchema,
  OpenEditorResultSchema,
  PermissionActionResultSchema,
  PermissionPromptArgumentsSchema,
  PermissionResultSchema,
  SetPinnedArgumentsSchema,
  ShortcutPreferencesArgumentsSchema,
  ShortcutValidationResultSchema,
  SingleIdentifierArgumentsSchema,
  ThemeExportResultSchema,
  ThemeImportResultSchema,
  parseClipboardCopyResult,
  parseDocumentResult,
  type DataImportPreview,
  type CaptureOutcome,
  type FileOperationResult,
  type ThemeImportPreview,
} from "../../shared/ipc/contract";
import type { PermissionState } from "../../shared/permissions/permissionState";
import { getThemeById } from "../../shared/theme/presets";
import {
  copyNotesToClipboard,
  type ClipboardWriter,
} from "../clipboard/noteClipboard";
import type { NoteRepository } from "../persistence/noteRepository";

export type IpcMainRegistrar = Pick<IpcMain, "handle" | "removeHandler">;

export interface CommandExecutor {
  execute(
    command: DocumentCommand,
  ): Promise<Result<KopperDocument, KopperError>>;
  undo(): Promise<Result<KopperDocument, KopperError>>;
}

export interface IpcFileOperations {
  activePath(): string;
  exportData(): Promise<FileOperationResult>;
  chooseImport(): Promise<Result<DataImportPreview | null, KopperError>>;
  confirmImport(token: string): Promise<Result<KopperDocument, KopperError>>;
  exportRecoveryBytes(): Promise<FileOperationResult>;
  createNewStore(): Promise<Result<KopperDocument, KopperError>>;
}

export interface IpcThemeFiles {
  importForPreview(): Promise<Result<ThemeImportPreview | null, KopperError>>;
  exportTheme(
    theme: ThemeDefinition,
  ): Promise<Result<{ path: string } | null, KopperError>>;
}

export interface IpcPermissionManager {
  check(prompt: boolean): PermissionState;
  openSettings(): Promise<void>;
}

export interface IpcPreferenceService {
  validateShortcuts(preferences: ShortcutPreferences): Result<void, KopperError>;
  setShortcuts(
    preferences: ShortcutPreferences,
  ): Promise<Result<KopperDocument, KopperError>>;
  setPinned(pinned: boolean): Promise<Result<KopperDocument, KopperError>>;
}

export interface IpcServices {
  files?: IpcFileOperations;
  themeFiles?: IpcThemeFiles;
  permissionManager?: IpcPermissionManager;
  getNativeAppearance?(): boolean;
  openEditorWindow?(noteId: string): void;
  publish?(document: KopperDocument): void;
  publishPermission?(state: PermissionState): void;
  onPermissionObserved?(state: PermissionState): void;
  getAccessibilitySession?(): { continuedWithoutCapture: boolean };
  continueWithoutCapture?(): void | Promise<void>;
  preferenceService?: IpcPreferenceService;
  requestCapture?(): Promise<CaptureOutcome>;
}

const NoArgumentsSchema = z.tuple([]);

function invalidRequest(
  message: string,
): ReturnType<typeof parseDocumentResult> {
  return {
    ok: false,
    error: {
      code: "validation_failed",
      message,
      retryable: false,
    },
  };
}

export function registerIpcHandlers(
  repository: NoteRepository,
  commandExecutor: CommandExecutor,
  ipcMain: IpcMainRegistrar,
  clipboard: ClipboardWriter = {
    writeText: () => {
      throw new Error("Clipboard writer is unavailable.");
    },
  },
  services: IpcServices = {},
): () => void {
  const getDocument = (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ): ReturnType<typeof parseDocumentResult> => {
    if (!NoArgumentsSchema.safeParse(args).success) {
      return parseDocumentResult(
        invalidRequest("The document request was invalid."),
      );
    }

    return parseDocumentResult(repository.currentResult());
  };

  const executeCommand = async (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ): Promise<ReturnType<typeof parseDocumentResult>> => {
    if (args.length !== 1) {
      return parseDocumentResult(
        invalidRequest("The document command was invalid."),
      );
    }
    const parsedCommand = DocumentCommandSchema.safeParse(args[0]);
    if (
      !parsedCommand.success ||
      parsedCommand.data.type.startsWith("shortcuts.") ||
      parsedCommand.data.type.startsWith("window.")
    ) {
      return parseDocumentResult(
        invalidRequest("The document command was invalid."),
      );
    }

    return parseDocumentResult(
      await commandExecutor.execute(parsedCommand.data),
    );
  };

  const undo = async (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ): Promise<ReturnType<typeof parseDocumentResult>> => {
    if (!NoArgumentsSchema.safeParse(args).success) {
      return parseDocumentResult(
        invalidRequest("The undo request was invalid."),
      );
    }

    return parseDocumentResult(await commandExecutor.undo());
  };

  const copyNotes = (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ): ReturnType<typeof parseClipboardCopyResult> => {
    const parsed = CopyNotesArgumentsSchema.safeParse(args);
    if (!parsed.success) {
      return parseClipboardCopyResult(
        invalidRequest("The clipboard request was invalid."),
      );
    }

    return parseClipboardCopyResult(
      copyNotesToClipboard(
        repository,
        clipboard,
        parsed.data[0],
        parsed.data[1],
      ),
    );
  };

  const unavailable = (message: string) => invalidRequest(message);

  const openEditorWindow = (_event: IpcMainInvokeEvent, ...args: unknown[]) => {
    const parsed = SingleIdentifierArgumentsSchema.safeParse(args);
    if (!parsed.success || services.openEditorWindow === undefined) {
      return OpenEditorResultSchema.parse(
        unavailable("The editor window request was invalid."),
      );
    }
    const current = repository.currentResult();
    if (
      !current.ok ||
      !current.value.notes.some(({ id }) => id === parsed.data[0])
    ) {
      return OpenEditorResultSchema.parse(
        unavailable("The requested note does not exist."),
      );
    }
    services.openEditorWindow(parsed.data[0]);
    return OpenEditorResultSchema.parse({
      ok: true,
      value: { noteId: parsed.data[0] },
    });
  };

  const noArgumentFileOperation = async <T>(
    args: unknown[],
    operation: (() => Promise<T>) | undefined,
    schema: { parse(input: unknown): T },
  ): Promise<T> => {
    if (!NoArgumentsSchema.safeParse(args).success || operation === undefined) {
      return schema.parse(
        unavailable("The file operation request was invalid."),
      );
    }
    return schema.parse(await operation());
  };

  const exportData = (_event: IpcMainInvokeEvent, ...args: unknown[]) =>
    noArgumentFileOperation(
      args,
      services.files?.exportData.bind(services.files),
      FileOperationResultSchema,
    );
  const chooseDataImport = (_event: IpcMainInvokeEvent, ...args: unknown[]) =>
    noArgumentFileOperation(
      args,
      services.files?.chooseImport.bind(services.files),
      DataImportPreviewResultSchema,
    );
  const exportRecoveryBytes = (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ) =>
    noArgumentFileOperation(
      args,
      services.files?.exportRecoveryBytes.bind(services.files),
      FileOperationResultSchema,
    );

  const confirmDataImport = async (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ) => {
    const parsed = ImportTokenArgumentsSchema.safeParse(args);
    if (!parsed.success || services.files === undefined) {
      return DocumentResultSchema.parse(
        unavailable("The import confirmation was invalid."),
      );
    }
    const result = DocumentResultSchema.parse(
      await services.files.confirmImport(parsed.data[0]),
    );
    if (result.ok) services.publish?.(result.value);
    return result;
  };

  const createNewStore = async (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ) => {
    if (
      !NoArgumentsSchema.safeParse(args).success ||
      services.files === undefined
    ) {
      return DocumentResultSchema.parse(
        unavailable("The create-store request was invalid."),
      );
    }
    const result = DocumentResultSchema.parse(
      await services.files.createNewStore(),
    );
    if (result.ok) services.publish?.(result.value);
    return result;
  };

  const getDataPath = (_event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (
      !NoArgumentsSchema.safeParse(args).success ||
      services.files === undefined
    ) {
      return DataPathResultSchema.parse(
        unavailable("The data-path request was invalid."),
      );
    }
    return DataPathResultSchema.parse({
      ok: true,
      value: services.files.activePath(),
    });
  };

  const importTheme = (_event: IpcMainInvokeEvent, ...args: unknown[]) =>
    noArgumentFileOperation(
      args,
      services.themeFiles?.importForPreview.bind(services.themeFiles),
      ThemeImportResultSchema,
    );

  const exportTheme = async (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ) => {
    const parsed = SingleIdentifierArgumentsSchema.safeParse(args);
    if (!parsed.success || services.themeFiles === undefined) {
      return ThemeExportResultSchema.parse(
        unavailable("The theme export request was invalid."),
      );
    }
    const current = repository.currentResult();
    if (!current.ok) return ThemeExportResultSchema.parse(current);
    const theme = getThemeById(current.value, parsed.data[0]);
    if (theme === null) {
      return ThemeExportResultSchema.parse(
        unavailable("The requested theme does not exist."),
      );
    }
    return ThemeExportResultSchema.parse(
      await services.themeFiles.exportTheme(theme),
    );
  };

  const getNativeAppearance = (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ) => {
    if (
      !NoArgumentsSchema.safeParse(args).success ||
      services.getNativeAppearance === undefined
    ) {
      return NativeAppearanceResultSchema.parse(
        unavailable("The native appearance request was invalid."),
      );
    }
    return NativeAppearanceResultSchema.parse({
      ok: true,
      value: services.getNativeAppearance(),
    });
  };

  let lastObservedPermissionState: PermissionState | undefined;
  const getAccessibilityPermission = (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ) => {
    const parsed = PermissionPromptArgumentsSchema.safeParse(args);
    if (!parsed.success || services.permissionManager === undefined) {
      return PermissionResultSchema.parse(
        unavailable("The Accessibility permission request was invalid."),
      );
    }

    try {
      const state = services.permissionManager.check(parsed.data[0]);
      services.onPermissionObserved?.(state);
      if (
        lastObservedPermissionState !== undefined &&
        state !== lastObservedPermissionState
      ) {
        services.publishPermission?.(state);
      }
      lastObservedPermissionState = state;
      return PermissionResultSchema.parse({ ok: true, value: state });
    } catch {
      return PermissionResultSchema.parse({
        ok: false,
        error: {
          code: "permission_denied",
          message: "Kopper could not check Accessibility access.",
          retryable: true,
          recoveryAction: "open_settings",
        },
      });
    }
  };

  const getAccessibilitySession = (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ) => {
    if (
      !NoArgumentsSchema.safeParse(args).success ||
      services.getAccessibilitySession === undefined
    ) {
      return AccessibilitySessionResultSchema.parse(
        unavailable("The capture setup state request was invalid."),
      );
    }

    try {
      return AccessibilitySessionResultSchema.parse({
        ok: true,
        value: services.getAccessibilitySession(),
      });
    } catch {
      return AccessibilitySessionResultSchema.parse({
        ok: false,
        error: {
          code: "read_failed",
          message: "Kopper could not load the capture setup state.",
          retryable: true,
        },
      });
    }
  };

  const openAccessibilitySettings = async (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ) => {
    if (
      !NoArgumentsSchema.safeParse(args).success ||
      services.permissionManager === undefined
    ) {
      return PermissionActionResultSchema.parse(
        unavailable("The Accessibility settings request was invalid."),
      );
    }

    try {
      await services.permissionManager.openSettings();
      return PermissionActionResultSchema.parse({
        ok: true,
        value: { acknowledged: true },
      });
    } catch {
      return PermissionActionResultSchema.parse({
        ok: false,
        error: {
          code: "permission_denied",
          message: "Kopper could not open Accessibility settings.",
          retryable: true,
          recoveryAction: "open_settings",
        },
      });
    }
  };

  const continueWithoutCapture = async (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ) => {
    if (
      !NoArgumentsSchema.safeParse(args).success ||
      services.continueWithoutCapture === undefined
    ) {
      return PermissionActionResultSchema.parse(
        unavailable("The onboarding dismissal request was invalid."),
      );
    }

    try {
      await services.continueWithoutCapture();
      return PermissionActionResultSchema.parse({
        ok: true,
        value: { acknowledged: true },
      });
    } catch {
      return PermissionActionResultSchema.parse({
        ok: false,
        error: {
          code: "write_failed",
          message: "Kopper could not continue without capture.",
          retryable: true,
        },
      });
    }
  };

  const requestCapture = async (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ) => {
    if (
      !NoArgumentsSchema.safeParse(args).success ||
      services.requestCapture === undefined
    ) {
      return {
        status: "failed" as const,
        error: {
          code: "permission_denied" as const,
          message: "Capture is unavailable.",
          retryable: true,
          recoveryAction: "open_settings" as const,
        },
      };
    }
    return services.requestCapture();
  };

  const validateShortcuts = (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ) => {
    const parsed = ShortcutPreferencesArgumentsSchema.safeParse(args);
    if (!parsed.success || services.preferenceService === undefined) {
      return ShortcutValidationResultSchema.parse(
        unavailable("The shortcut validation request was invalid."),
      );
    }
    const result = services.preferenceService.validateShortcuts(parsed.data[0]);
    return ShortcutValidationResultSchema.parse(
      result.ok ? { ok: true, value: { valid: true } } : result,
    );
  };

  const saveShortcuts = async (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ) => {
    const parsed = ShortcutPreferencesArgumentsSchema.safeParse(args);
    if (!parsed.success || services.preferenceService === undefined) {
      return DocumentResultSchema.parse(
        unavailable("The shortcut save request was invalid."),
      );
    }
    return DocumentResultSchema.parse(
      await services.preferenceService.setShortcuts(parsed.data[0]),
    );
  };

  const setPinned = async (
    _event: IpcMainInvokeEvent,
    ...args: unknown[]
  ) => {
    const parsed = SetPinnedArgumentsSchema.safeParse(args);
    if (!parsed.success || services.preferenceService === undefined) {
      return DocumentResultSchema.parse(
        unavailable("The pin request was invalid."),
      );
    }
    return DocumentResultSchema.parse(
      await services.preferenceService.setPinned(parsed.data[0]),
    );
  };

  const channels = [
    [IPC_CHANNELS.getDocument, getDocument],
    [IPC_CHANNELS.executeCommand, executeCommand],
    [IPC_CHANNELS.undo, undo],
    [IPC_CHANNELS.copyNotes, copyNotes],
    [IPC_CHANNELS.openEditorWindow, openEditorWindow],
    [IPC_CHANNELS.exportData, exportData],
    [IPC_CHANNELS.chooseDataImport, chooseDataImport],
    [IPC_CHANNELS.confirmDataImport, confirmDataImport],
    [IPC_CHANNELS.exportRecoveryBytes, exportRecoveryBytes],
    [IPC_CHANNELS.createNewStore, createNewStore],
    [IPC_CHANNELS.getDataPath, getDataPath],
    [IPC_CHANNELS.importTheme, importTheme],
    [IPC_CHANNELS.exportTheme, exportTheme],
    [IPC_CHANNELS.getNativeAppearance, getNativeAppearance],
    [IPC_CHANNELS.getAccessibilityPermission, getAccessibilityPermission],
    [IPC_CHANNELS.getAccessibilitySession, getAccessibilitySession],
    [IPC_CHANNELS.openAccessibilitySettings, openAccessibilitySettings],
    [IPC_CHANNELS.continueWithoutCapture, continueWithoutCapture],
    [IPC_CHANNELS.requestCapture, requestCapture],
    [IPC_CHANNELS.validateShortcuts, validateShortcuts],
    [IPC_CHANNELS.saveShortcuts, saveShortcuts],
    [IPC_CHANNELS.setPinned, setPinned],
  ] as const;
  for (const [channel, handler] of channels) {
    ipcMain.handle(channel, handler);
  }

  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    for (const [channel] of channels) {
      ipcMain.removeHandler(channel);
    }
  };
}
