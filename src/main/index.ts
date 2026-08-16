import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  nativeTheme,
  shell,
  systemPreferences,
} from "electron";

import { APP_NAME, STORE_FILE_NAME } from "../shared/appIdentity";
import {
  DEFAULT_SHORTCUT_PREFERENCES,
  DEFAULT_WINDOW_PREFERENCES,
} from "../shared/domain/document";
import type { CaptureOutcome } from "../shared/ipc/contract";
import { IPC_CHANNELS } from "../shared/ipc/contract";
import { CaptureCoordinator } from "./capture/captureCoordinator";
import { CaptureRequestService } from "./capture/captureRequestService";
import { CaptureRuntime } from "./capture/captureRuntime";
import { SelectionCapture } from "./capture/selectionCapture";
import { CommandService } from "./domain/commandService";
import { MainOperationCoordinator } from "./domain/mainOperationCoordinator";
import { DocumentFiles } from "./files/documentFiles";
import { registerIpcHandlers } from "./ipc/registerIpcHandlers";
import { ControlledQuit } from "./lifecycle/controlledQuit";
import { registerNativeAppearance } from "./nativeAppearance";
import { PermissionManager } from "./permissions/permissionManager";
import { PermissionObserver } from "./permissions/permissionObserver";
import { NoteRepository } from "./persistence/noteRepository";
import { PreferenceService } from "./preferences/preferenceService";
import {
  publishCaptureOutcome,
  publishDocument,
  publishNativeAppearance,
  publishPermissionState,
} from "./publishDocument";
import { createGlobalKeyboardMonitor } from "./shortcuts/globalKeyboardMonitor";
import { ShortcutManager } from "./shortcuts/shortcutManager";
import { ThemeFiles } from "./theme/themeFiles";
import { WindowManager } from "./window/windowManager";

app.setName(APP_NAME);

let cleanupIpcHandlers: (() => void) | undefined;
let cleanupNativeAppearance: (() => void) | undefined;
let captureRuntime: CaptureRuntime | undefined;
let shortcutManager: ShortcutManager | undefined;
let windowManager: WindowManager | undefined;

const controlledQuit = new ControlledQuit({
  flushBounds: () => windowManager?.flushBounds(),
  disposeCaptureRuntime: async () => {
    await captureRuntime?.dispose();
    captureRuntime = undefined;
  },
  disposeShortcutManager: async () => {
    await shortcutManager?.dispose();
    shortcutManager = undefined;
  },
  finishQuit: () => {
    windowManager?.beginQuit();
    app.quit();
  },
});

void app.whenReady().then(async () => {
  const repository = new NoteRepository(
    join(app.getPath("userData"), STORE_FILE_NAME),
  );
  const loadResult = await repository.load();
  const initialDocument = loadResult.ok ? loadResult.value : undefined;

  const publish = (document: ReturnType<NoteRepository["snapshot"]>) => {
    publishDocument(BrowserWindow.getAllWindows(), document);
  };
  const publishCapture = (outcome: CaptureOutcome) => {
    publishCaptureOutcome(BrowserWindow.getAllWindows(), outcome);
    if (outcome.status === "captured") windowManager?.acknowledgeCapture();
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
  const permissionManager = new PermissionManager({
    platform: process.platform,
    isTrustedAccessibilityClient: (prompt) =>
      systemPreferences.isTrustedAccessibilityClient(prompt),
    openExternal: (url) => shell.openExternal(url),
  });
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
  let captureRequestService!: CaptureRequestService;
  const requestCapture = (): Promise<CaptureOutcome> =>
    captureRequestService.requestCapture();

  windowManager = new WindowManager({
    initialBounds:
      initialDocument?.window.bounds ?? DEFAULT_WINDOW_PREFERENCES.bounds,
    pinned: initialDocument?.window.pinned ?? DEFAULT_WINDOW_PREFERENCES.pinned,
    requestCapture: () => {
      void requestCapture();
    },
    openSettings: () => {
      windowManager?.sendToMain(IPC_CHANNELS.openSettings);
    },
  });

  shortcutManager = new ShortcutManager(
    globalShortcut,
    () =>
      createGlobalKeyboardMonitor({
        onCapture: () => {
          void requestCapture();
        },
      }),
    {
      onCapture: () => {
        void requestCapture();
      },
      onTogglePanel: () => windowManager?.toggle(),
    },
  );
  const preferenceService = new PreferenceService(
    repository,
    shortcutManager,
    windowManager,
    operationCoordinator,
    {
      publish,
      preferencesCommitted: () => captureRuntime?.retryCaptureBinding(),
    },
  );
  windowManager.setBoundsPersistence(async (bounds) => {
    await preferenceService.setBounds(bounds);
  });

  const startupPreferences =
    initialDocument ?? {
      ...repository.snapshot(),
      shortcuts: structuredClone(DEFAULT_SHORTCUT_PREFERENCES),
      window: structuredClone(DEFAULT_WINDOW_PREFERENCES),
    };
  const documentFiles = new DocumentFiles(repository, dialog, {
    operationCoordinator,
    replaceDocument: (document, persist) =>
      preferenceService.replaceDocument(document, persist),
    externalReplacementSucceeded: async () => {
      commandService.clearUndoHistory();
      await captureRuntime?.setRepositoryHealthy(true);
      await captureRuntime?.retryCaptureBinding();
    },
  });
  const themeFiles = new ThemeFiles(dialog);

  captureRuntime = new CaptureRuntime(
    permissionManager,
    shortcutManager,
    publishCapture,
  );
  const onboardingSession = { continuedWithoutCapture: false };
  const completeOnboarding = () => windowManager?.completeOnboarding();
  const permissionObserver = new PermissionObserver(
    permissionManager,
    (state) => captureRuntime?.onPermissionObserved(state) ?? Promise.resolve(),
    (state) => publishPermissionState(BrowserWindow.getAllWindows(), state),
    (state) => {
      if (state === "granted") completeOnboarding();
    },
  );
  captureRequestService = new CaptureRequestService(
    permissionObserver,
    captureRuntime,
    captureCoordinator,
    publishCapture,
  );

  cleanupIpcHandlers = registerIpcHandlers(
    repository,
    commandService,
    ipcMain,
    clipboard,
    {
      files: documentFiles,
      themeFiles,
      permissionManager,
      permissionObserver,
      preferenceService,
      requestCapture,
      getNativeAppearance: () => nativeTheme.shouldUseDarkColors,
      openEditorWindow: (noteId) =>
        windowManager?.openExpandedEditorWindow(noteId),
      publish,
      getAccessibilitySession: () => ({
        continuedWithoutCapture: onboardingSession.continuedWithoutCapture,
      }),
      continueWithoutCapture: () => {
        onboardingSession.continuedWithoutCapture = true;
        completeOnboarding();
      },
    },
  );
  windowManager.createMainWindow();
  const startupNative = await preferenceService.applyStartup(startupPreferences);
  if (!startupNative.ok) {
    publishCapture({ status: "failed", error: startupNative.error });
  }

  cleanupNativeAppearance = registerNativeAppearance(
    nativeTheme,
    (shouldUseDarkColors) => {
      publishNativeAppearance(
        BrowserWindow.getAllWindows(),
        shouldUseDarkColors,
      );
    },
  );
  await captureRuntime.start(loadResult.ok);
  if (captureRuntime.isCaptureAvailable()) completeOnboarding();

  app.on("activate", () => {
    void permissionObserver
      .observe(false)
      .catch(() => undefined)
      .finally(() => windowManager?.show());
  });
});

app.on("before-quit", (event) => {
  controlledQuit.handleBeforeQuit(event);
});

app.on("will-quit", () => {
  windowManager?.dispose();
  windowManager = undefined;
  cleanupIpcHandlers?.();
  cleanupIpcHandlers = undefined;
  cleanupNativeAppearance?.();
  cleanupNativeAppearance = undefined;
});

app.on("window-all-closed", () => {
  // Kopper remains available from its status item until the user explicitly quits.
});
