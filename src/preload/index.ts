import { contextBridge, ipcRenderer } from "electron";

import { DocumentCommandSchema } from "../shared/domain/commands";
import { KopperDocumentSchema } from "../shared/domain/document";
import {
  AccessibilitySessionResultSchema,
  CaptureOutcomeSchema,
  CopyNotesArgumentsSchema,
  DataImportPreviewResultSchema,
  DataPathResultSchema,
  FileOperationResultSchema,
  ImportTokenArgumentsSchema,
  IPC_CHANNELS,
  NativeAppearanceResultSchema,
  NativeAppearanceSchema,
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
  type KopperApi,
} from "../shared/ipc/contract";
import { PermissionStateSchema } from "../shared/permissions/permissionState";

const api: KopperApi = {
  async getDocument() {
    return parseDocumentResult(
      await ipcRenderer.invoke(IPC_CHANNELS.getDocument),
    );
  },

  async execute(command) {
    const parsedCommand = DocumentCommandSchema.parse(command);
    return parseDocumentResult(
      await ipcRenderer.invoke(IPC_CHANNELS.executeCommand, parsedCommand),
    );
  },

  async undo() {
    return parseDocumentResult(await ipcRenderer.invoke(IPC_CHANNELS.undo));
  },

  async copyNotes(noteIds, mode) {
    const [parsedIds, parsedMode] = CopyNotesArgumentsSchema.parse([
      noteIds,
      mode,
    ]);
    return parseClipboardCopyResult(
      await ipcRenderer.invoke(IPC_CHANNELS.copyNotes, parsedIds, parsedMode),
    );
  },

  async openEditorWindow(noteId) {
    const [parsedNoteId] = SingleIdentifierArgumentsSchema.parse([noteId]);
    return OpenEditorResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.openEditorWindow, parsedNoteId),
    );
  },

  async exportData() {
    return FileOperationResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.exportData),
    );
  },

  async chooseDataImport() {
    return DataImportPreviewResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.chooseDataImport),
    );
  },

  async confirmDataImport(token) {
    const [parsedToken] = ImportTokenArgumentsSchema.parse([token]);
    return parseDocumentResult(
      await ipcRenderer.invoke(IPC_CHANNELS.confirmDataImport, parsedToken),
    );
  },

  async exportRecoveryBytes() {
    return FileOperationResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.exportRecoveryBytes),
    );
  },

  async createNewStore() {
    return parseDocumentResult(
      await ipcRenderer.invoke(IPC_CHANNELS.createNewStore),
    );
  },

  async getDataPath() {
    return DataPathResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.getDataPath),
    );
  },

  async importTheme() {
    return ThemeImportResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.importTheme),
    );
  },

  async exportTheme(themeId) {
    const [parsedThemeId] = SingleIdentifierArgumentsSchema.parse([themeId]);
    return ThemeExportResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.exportTheme, parsedThemeId),
    );
  },

  async getNativeAppearance() {
    return NativeAppearanceResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.getNativeAppearance),
    );
  },

  async getAccessibilityPermission(prompt) {
    const [parsedPrompt] = PermissionPromptArgumentsSchema.parse([prompt]);
    return PermissionResultSchema.parse(
      await ipcRenderer.invoke(
        IPC_CHANNELS.getAccessibilityPermission,
        parsedPrompt,
      ),
    );
  },

  async getAccessibilitySession() {
    return AccessibilitySessionResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.getAccessibilitySession),
    );
  },

  async openAccessibilitySettings() {
    return PermissionActionResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.openAccessibilitySettings),
    );
  },

  async continueWithoutCapture() {
    return PermissionActionResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.continueWithoutCapture),
    );
  },

  onAccessibilityPermissionChanged(listener) {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      input: unknown,
    ) => {
      listener(PermissionStateSchema.parse(input));
    };
    ipcRenderer.on(
      IPC_CHANNELS.accessibilityPermissionChanged,
      wrappedListener,
    );

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      ipcRenderer.removeListener(
        IPC_CHANNELS.accessibilityPermissionChanged,
        wrappedListener,
      );
    };
  },

  onCaptureOutcome(listener) {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      input: unknown,
    ) => {
      listener(CaptureOutcomeSchema.parse(input));
    };
    ipcRenderer.on(IPC_CHANNELS.captureOutcome, wrappedListener);

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      ipcRenderer.removeListener(IPC_CHANNELS.captureOutcome, wrappedListener);
    };
  },

  async requestCapture() {
    return CaptureOutcomeSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.requestCapture),
    );
  },

  async validateShortcuts(preferences) {
    const [parsed] = ShortcutPreferencesArgumentsSchema.parse([preferences]);
    return ShortcutValidationResultSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.validateShortcuts, parsed),
    );
  },

  async saveShortcuts(preferences) {
    const [parsed] = ShortcutPreferencesArgumentsSchema.parse([preferences]);
    return parseDocumentResult(
      await ipcRenderer.invoke(IPC_CHANNELS.saveShortcuts, parsed),
    );
  },

  async setPinned(pinned) {
    const [parsed] = SetPinnedArgumentsSchema.parse([pinned]);
    return parseDocumentResult(
      await ipcRenderer.invoke(IPC_CHANNELS.setPinned, parsed),
    );
  },

  onOpenSettings(listener) {
    const wrappedListener = () => listener();
    ipcRenderer.on(IPC_CHANNELS.openSettings, wrappedListener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      ipcRenderer.removeListener(IPC_CHANNELS.openSettings, wrappedListener);
    };
  },

  onNativeAppearanceChanged(listener) {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      input: unknown,
    ) => {
      listener(NativeAppearanceSchema.parse(input));
    };
    ipcRenderer.on(IPC_CHANNELS.nativeAppearanceChanged, wrappedListener);

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      ipcRenderer.removeListener(
        IPC_CHANNELS.nativeAppearanceChanged,
        wrappedListener,
      );
    };
  },

  subscribeDocument(listener) {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      input: unknown,
    ) => {
      listener(KopperDocumentSchema.parse(input));
    };

    ipcRenderer.on(IPC_CHANNELS.documentChanged, wrappedListener);

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      ipcRenderer.removeListener(IPC_CHANNELS.documentChanged, wrappedListener);
    };
  },
};

contextBridge.exposeInMainWorld("kopper", api);
