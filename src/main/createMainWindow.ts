import { BrowserWindow } from "electron";
import { join } from "node:path";

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 380,
    height: 640,
    minWidth: 340,
    minHeight: 480,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  window.once("ready-to-show", () => window.show());
  return window;
}
