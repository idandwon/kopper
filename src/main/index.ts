import { app, BrowserWindow } from "electron";
import { APP_NAME } from "../shared/appIdentity";
import { createMainWindow } from "./createMainWindow";

app.setName(APP_NAME);

void app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // The macOS WindowManager task replaces this temporary lifecycle with menu-bar hiding.
  app.quit();
});
