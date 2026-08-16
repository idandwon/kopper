import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { app, BrowserWindow, clipboard, ipcMain } from "electron";

import { APP_NAME, STORE_FILE_NAME } from "../shared/appIdentity";
import { IPC_CHANNELS } from "../shared/ipc/contract";
import { createMainWindow } from "./createMainWindow";
import { CommandService } from "./domain/commandService";
import { registerIpcHandlers } from "./ipc/registerIpcHandlers";
import { NoteRepository } from "./persistence/noteRepository";

app.setName(APP_NAME);

let cleanupIpcHandlers: (() => void) | undefined;

void app.whenReady().then(async () => {
  const repository = new NoteRepository(
    join(app.getPath("userData"), STORE_FILE_NAME),
  );
  await repository.load();

  const commandService = new CommandService(repository, {
    now: () => new Date().toISOString(),
    createId: randomUUID,
    publish: (document) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.documentChanged, document);
        }
      }
    },
  });
  cleanupIpcHandlers = registerIpcHandlers(
    repository,
    commandService,
    ipcMain,
    clipboard,
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
