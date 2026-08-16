import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  shell,
  systemPreferences,
} from "electron";

import { APP_NAME, STORE_FILE_NAME } from "../shared/appIdentity";
import { CaptureCoordinator } from "./capture/captureCoordinator";
import { CaptureRuntime } from "./capture/captureRuntime";
import { SelectionCapture } from "./capture/selectionCapture";
import {
  createMainWindow,
  openExpandedEditorWindow,
} from "./createMainWindow";
import { DocumentFiles } from "./files/documentFiles";
import { CommandService } from "./domain/commandService";
import { MainOperationCoordinator } from "./domain/mainOperationCoordinator";
import { registerIpcHandlers } from "./ipc/registerIpcHandlers";
import { PermissionManager } from "./permissions/permissionManager";
import { createGlobalKeyboardMonitor } from "./shortcuts/globalKeyboardMonitor";
import { registerNativeAppearance } from "./nativeAppearance";
import { NoteRepository } from "./persistence/noteRepository";
import {
  publishCaptureOutcome,
  publishDocument,
  publishNativeAppearance,
  publishPermissionState,
} from "./publishDocument";
import { ThemeFiles } from "./theme/themeFiles";

app.setName(APP_NAME);

let cleanupIpcHandlers: (() => void) | undefined;
let cleanupNativeAppearance: (() => void) | undefined;
let captureRuntime: CaptureRuntime | undefined;

void app.whenReady().then(async () => {
  const repository = new NoteRepository(
    join(app.getPath("userData"), STORE_FILE_NAME),
  );
  const loadResult = await repository.load();

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
    externalReplacementSucceeded: async () => {
      commandService.clearUndoHistory();
      await captureRuntime?.setRepositoryHealthy(true);
    },
  });
  const themeFiles = new ThemeFiles(dialog);
  const permissionManager = new PermissionManager({
    platform: process.platform,
    isTrustedAccessibilityClient: (prompt) =>
      systemPreferences.isTrustedAccessibilityClient(prompt),
    openExternal: (url) => shell.openExternal(url),
  });
  const publishCapture = (outcome: unknown) => {
    publishCaptureOutcome(BrowserWindow.getAllWindows(), outcome);
  };
  const selectionCapture = new SelectionCapture({
    clipboard,
    nativeImage,
    execFile: (file, args, options, callback) =>
      execFile(file, args, options, (error, stdout, stderr) => {
        callback(error, stdout, stderr);
      }),
  });
  const captureCoordinator = new CaptureCoordinator(
    selectionCapture,
    commandService,
    { currentResult: () => repository.currentResult() },
    {
      createId: randomUUID,
      publish: publishCapture,
      repositoryBecameUnhealthy: () => {
        void captureRuntime?.setRepositoryHealthy(false);
      },
    },
  );
  captureRuntime = new CaptureRuntime(
    permissionManager,
    () =>
      createGlobalKeyboardMonitor({
        onCapture: () => {
          void captureCoordinator.requestCapture();
        },
      }),
    publishCapture,
  );
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
      onPermissionObserved: (state) => {
        void captureRuntime?.onPermissionObserved(state);
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
  await captureRuntime.start(loadResult.ok);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("will-quit", () => {
  captureRuntime?.dispose();
  captureRuntime = undefined;
  cleanupIpcHandlers?.();
  cleanupIpcHandlers = undefined;
  cleanupNativeAppearance?.();
  cleanupNativeAppearance = undefined;
});

app.on("window-all-closed", () => {
  // The macOS WindowManager task replaces this temporary lifecycle with menu-bar hiding.
  app.quit();
});
