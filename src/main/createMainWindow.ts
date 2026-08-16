import { BrowserWindow } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const secureWebPreferences = {
  preload: join(__dirname, "../preload/index.js"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
} as const;

function rendererEntryUrl(): URL {
  if (process.env.ELECTRON_RENDERER_URL) {
    return new URL(process.env.ELECTRON_RENDERER_URL);
  }
  return pathToFileURL(join(__dirname, "../renderer/index.html"));
}

function isTrustedRendererNavigation(navigationUrl: string): boolean {
  try {
    const expected = rendererEntryUrl();
    const requested = new URL(navigationUrl);
    expected.hash = "";
    requested.hash = "";
    return requested.href === expected.href;
  } catch {
    return false;
  }
}

function installNavigationSecurity(window: BrowserWindow): void {
  window.webContents.on("will-navigate", (event, navigationUrl) => {
    if (!isTrustedRendererNavigation(navigationUrl)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

function loadRenderer(window: BrowserWindow, hash?: string): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL);
    if (hash !== undefined) url.hash = hash;
    void window.loadURL(url.toString());
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"),
      hash === undefined ? undefined : { hash });
  }
}

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
    webPreferences: secureWebPreferences,
  });

  installNavigationSecurity(window);
  loadRenderer(window);
  window.once("ready-to-show", () => window.show());
  return window;
}

const expandedEditorWindows = new Map<string, BrowserWindow>();

export function openExpandedEditorWindow(noteId: string): BrowserWindow {
  const existing = expandedEditorWindows.get(noteId);
  if (existing !== undefined && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }

  const window = new BrowserWindow({
    width: 680,
    height: 720,
    minWidth: 420,
    minHeight: 480,
    show: false,
    title: "Edit note",
    webPreferences: secureWebPreferences,
  });
  expandedEditorWindows.set(noteId, window);
  installNavigationSecurity(window);
  loadRenderer(window, `editor=${encodeURIComponent(noteId)}`);
  window.once("ready-to-show", () => window.show());
  window.once("closed", () => {
    if (expandedEditorWindows.get(noteId) === window) {
      expandedEditorWindows.delete(noteId);
    }
  });
  return window;
}
