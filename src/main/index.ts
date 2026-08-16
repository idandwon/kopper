import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
  systemPreferences,
} from "electron";

import { APP_NAME, STORE_FILE_NAME } from "../shared/appIdentity";
import {
  createMainWindow,
  openExpandedEditorWindow,
} from "./createMainWindow";
import { DocumentFiles } from "./files/documentFiles";
import { CommandService } from "./domain/commandService";
import { MainOperationCoordinator } from "./domain/mainOperationCoordinator";
import { registerIpcHandlers } from "./ipc/registerIpcHandlers";
import { PermissionManager } from "./permissions/permissionManager";
import { registerNativeAppearance } from "./nativeAppearance";
import { NoteRepository } from "./persistence/noteRepository";
import {
  publishDocument,
  publishNativeAppearance,
  publishPermissionState,
} from "./publishDocument";
import { ThemeFiles } from "./theme/themeFiles";

app.setName(APP_NAME);

let cleanupIpcHandlers: (() => void) | undefined;
let cleanupNativeAppearance: (() => void) | undefined;

void app.whenReady().then(async () => {
  const repository = new NoteRepository(
    join(app.getPath("userData"), STORE_FILE_NAME),
  );
  await repository.load();

  const publish = (document: ReturnType<NoteRepository["snapshot"]>) => {
    publishDocument(BrowserWindow.getAllWindows(), document);
  };
  const operationCoordinator = new MainOperationCoordinator();
  const commandService = new CommandService(
    repository,
    {
      now: () => new Date().toISOString(),
      createId: randomUUID,
      publish,
    },
    operationCoordinator,
  );
  const documentFiles = new DocumentFiles(repository, dialog, {
    operationCoordinator,
    externalReplacementSucceeded: () => commandService.clearUndoHistory(),
  });
  const themeFiles = new ThemeFiles(dialog);
  const permissionManager = new PermissionManager({
    platform: process.platform,
    isTrustedAccessibilityClient: (prompt) =>
      systemPreferences.isTrustedAccessibilityClient(prompt),
    openExternal: (url) => shell.openExternal(url),
  });
  const onboardingSession = { continuedWithoutCapture: false };
  cleanupIpcHandlers = registerIpcHandlers(
    repository,
    commandService,
    ipcMain,
    clipboard,
    {
      files: documentFiles,
      themeFiles,
      permissionManager,
      getNativeAppearance: () => nativeTheme.shouldUseDarkColors,
      openEditorWindow: openExpandedEditorWindow,
      publish,
      publishPermission: (state) => {
        publishPermissionState(BrowserWindow.getAllWindows(), state);
      },
      getAccessibilitySession: () => ({
        continuedWithoutCapture: onboardingSession.continuedWithoutCapture,
      }),
      continueWithoutCapture: () => {
        onboardingSession.continuedWithoutCapture = true;
      },
    },
  );
  cleanupNativeAppearance = registerNativeAppearance(
    nativeTheme,
    (shouldUseDarkColors) => {
      publishNativeAppearance(
        BrowserWindow.getAllWindows(),
        shouldUseDarkColors,
      );
    },
  );
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("will-quit", () => {
  cleanupIpcHandlers?.();
  cleanupIpcHandlers = undefined;
  cleanupNativeAppearance?.();
  cleanupNativeAppearance = undefined;
});

app.on("window-all-closed", () => {
  // The macOS WindowManager task replaces this temporary lifecycle with menu-bar hiding.
  app.quit();
});
