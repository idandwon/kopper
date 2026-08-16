import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { app, BrowserWindow, clipboard, dialog, ipcMain } from "electron";

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
import { publishDocument } from "./publishDocument";

app.setName(APP_NAME);

let cleanupIpcHandlers: (() => void) | undefined;

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
  cleanupIpcHandlers = registerIpcHandlers(
    repository,
    commandService,
    ipcMain,
    clipboard,
    {
      files: documentFiles,
      openEditorWindow: openExpandedEditorWindow,
      publish,
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
});

app.on("window-all-closed", () => {
  // The macOS WindowManager task replaces this temporary lifecycle with menu-bar hiding.
  app.quit();
});
