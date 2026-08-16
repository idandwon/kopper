import { join } from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";

import { APP_NAME, STORE_FILE_NAME } from "../shared/appIdentity";
import { createMainWindow } from "./createMainWindow";
import { registerIpcHandlers } from "./ipc/registerIpcHandlers";
import { NoteRepository } from "./persistence/noteRepository";

app.setName(APP_NAME);

let cleanupIpcHandlers: (() => void) | undefined;

void app.whenReady().then(async () => {
  const repository = new NoteRepository(
    join(app.getPath("userData"), STORE_FILE_NAME),
  );
  const initialLoadResult = await repository.load();

  cleanupIpcHandlers = registerIpcHandlers(
    repository,
    ipcMain,
    initialLoadResult,
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
