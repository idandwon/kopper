import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
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
import { NoteRepository } from "./persistence/noteRepository";
import {
  publishDocument,
  publishNativeAppearance,
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
  cleanupIpcHandlers = registerIpcHandlers(
    repository,
    commandService,
    ipcMain,
    clipboard,
    {
      files: documentFiles,
      themeFiles,
      getNativeAppearance: () => nativeTheme.shouldUseDarkColors,
      openEditorWindow: openExpandedEditorWindow,
      publish,
    },
  );
  const nativeAppearanceUpdated = () => {
    publishNativeAppearance(
      BrowserWindow.getAllWindows(),
      nativeTheme.shouldUseDarkColors,
    );
  };
  nativeTheme.on("updated", nativeAppearanceUpdated);
  cleanupNativeAppearance = () => {
    nativeTheme.off("updated", nativeAppearanceUpdated);
  };
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
