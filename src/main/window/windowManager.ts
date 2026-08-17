import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  screen,
  Tray,
  type Rectangle,
} from "electron";

import type { WindowBounds } from "../../shared/domain/document";
import type { CaptureOutcome } from "../../shared/ipc/contract";
import type { SecurityWindowRegistry } from "../security/securityPolicy";
import { CaptureHud } from "./captureHud";
import { loadRenderer } from "./loadRenderer";

const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 640;
const MIN_WIDTH = 340;
const MIN_HEIGHT = 480;
const EDGE_INSET = 24;
const BOUNDS_DEBOUNCE_MS = 250;

const secureWebPreferences = {
  preload: join(__dirname, "../preload/index.js"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
};

function rendererEntryUrl(): URL {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    try {
      return new URL(process.env.ELECTRON_RENDERER_URL);
    } catch {
      // Invalid development configuration never widens renderer trust.
    }
  }
  return pathToFileURL(join(__dirname, "../renderer/index.html"));
}

function intersects(left: Rectangle, right: Rectangle): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function clamp(bounds: WindowBounds, workArea: Rectangle): WindowBounds {
  const width = Math.min(Math.max(bounds.width, MIN_WIDTH), workArea.width);
  const height = Math.min(Math.max(bounds.height, MIN_HEIGHT), workArea.height);
  return {
    x: Math.min(
      Math.max(bounds.x, workArea.x),
      workArea.x + workArea.width - width,
    ),
    y: Math.min(
      Math.max(bounds.y, workArea.y),
      workArea.y + workArea.height - height,
    ),
    width,
    height,
  };
}

function statusIcon() {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="black" d="M3 2h10v12H3zM5 4v8h6V4zM6 6h4v1H6zm0 3h4v1H6z"/></svg>';
  const icon = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  );
  icon.setTemplateImage(true);
  return icon;
}

export interface WindowManagerOptions {
  initialBounds?: WindowBounds | null;
  pinned?: boolean;
  persistBounds?(bounds: WindowBounds): void | Promise<void>;
  requestCapture?(): void;
  openSettings?(): void;
}

export class WindowManager implements SecurityWindowRegistry {
  readonly rendererUrl = rendererEntryUrl();
  private mainWindow: BrowserWindow | undefined;
  private readonly editorWindows = new Map<string, BrowserWindow>();
  private tray: Tray | undefined;
  private quitting = false;
  private dockHidden = false;
  private persistBounds: (bounds: WindowBounds) => void | Promise<void>;
  private boundsTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingBounds: WindowBounds | undefined;
  private boundsPersistenceTail: Promise<void> = Promise.resolve();
  private mainWindowReady = false;
  private explicitOpenPending = false;
  private readonly captureHud: CaptureHud;
  private readonly windowCreatedListeners = new Set<
    (window: BrowserWindow) => void
  >();

  constructor(private readonly options: WindowManagerOptions = {}) {
    this.persistBounds = options.persistBounds ?? (() => undefined);
    this.captureHud = new CaptureHud({
      rendererUrl: this.rendererUrl,
      createWindow: (bounds) =>
        new BrowserWindow({
          ...bounds,
          frame: false,
          transparent: true,
          backgroundColor: "#00000000",
          focusable: false,
          resizable: false,
          skipTaskbar: true,
          show: false,
          alwaysOnTop: true,
          hasShadow: false,
          webPreferences: secureWebPreferences,
        }),
      windowCreated: (window) => this.notifyWindowCreated(window),
    });
  }

  setBoundsPersistence(
    persist: (bounds: WindowBounds) => void | Promise<void>,
  ): void {
    this.persistBounds = persist;
  }

  createMainWindow(): BrowserWindow {
    if (this.mainWindow !== undefined && !this.mainWindow.isDestroyed()) {
      return this.mainWindow;
    }

    const bounds = this.initialPanelBounds(this.options.initialBounds ?? null);
    const window = new BrowserWindow({
      ...bounds,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: true,
      vibrancy: "popover",
      visualEffectState: "active",
      webPreferences: secureWebPreferences,
    });
    this.mainWindow = window;
    this.notifyWindowCreated(window);
    this.mainWindowReady = false;
    this.explicitOpenPending = false;
    loadRenderer(window, this.rendererUrl);
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.setAlwaysOnTop(this.options.pinned ?? false);
    window.once("ready-to-show", () => {
      this.mainWindowReady = true;
      if (this.explicitOpenPending) {
        this.explicitOpenPending = false;
        window.show();
        window.focus();
        return;
      }
      window.show();
    });
    window.on("move", () => this.scheduleBoundsPersistence());
    window.on("resize", () => this.scheduleBoundsPersistence());
    window.on("close", (event) => {
      if (this.quitting) return;
      event.preventDefault();
      this.hide();
    });
    window.once("closed", () => {
      if (this.mainWindow === window) {
        this.mainWindow = undefined;
        this.mainWindowReady = false;
        this.explicitOpenPending = false;
      }
    });
    return window;
  }

  openExpandedEditorWindow(noteId: string): BrowserWindow {
    const existing = this.editorWindows.get(noteId);
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
    this.editorWindows.set(noteId, window);
    this.notifyWindowCreated(window);
    loadRenderer(window, this.rendererUrl, `editor=${encodeURIComponent(noteId)}`);
    window.once("ready-to-show", () => window.show());
    window.once("closed", () => {
      if (this.editorWindows.get(noteId) === window) {
        this.editorWindows.delete(noteId);
      }
    });
    return window;
  }

  getWindows(): BrowserWindow[] {
    const windows = this.getContentWindows();
    const captureHudWindow = this.captureHud.getWindow();
    if (captureHudWindow !== undefined) windows.push(captureHudWindow);
    return windows;
  }

  getContentWindows(): BrowserWindow[] {
    const windows = [...this.editorWindows.values()];
    if (this.mainWindow !== undefined) windows.unshift(this.mainWindow);
    return windows.filter((window) => !window.isDestroyed());
  }

  onWindowCreated(listener: (window: BrowserWindow) => void): () => void {
    this.windowCreatedListeners.add(listener);
    return () => this.windowCreatedListeners.delete(listener);
  }

  show(): void {
    const window = this.createMainWindow();
    if (!this.mainWindowReady) {
      this.explicitOpenPending = true;
      return;
    }
    window.show();
    window.focus();
  }

  hide(): void {
    void this.flushBounds().catch(() => {
      // Hiding remains reliable when bounds persistence fails.
    });
    this.mainWindow?.hide();
  }

  toggle(): void {
    const window = this.createMainWindow();
    if (window.isVisible()) this.hide();
    else this.show();
  }

  isVisible(): boolean {
    return this.mainWindow?.isVisible() ?? false;
  }

  showCaptureOutcome(outcome: CaptureOutcome): void {
    this.captureHud.show(outcome);
  }

  setPinned(pinned: boolean): void {
    this.createMainWindow().setAlwaysOnTop(pinned);
  }

  getPinned(): boolean {
    return this.createMainWindow().isAlwaysOnTop();
  }

  getBounds(): WindowBounds {
    return this.createMainWindow().getBounds();
  }

  setBounds(bounds: WindowBounds | null): void {
    if (bounds === null) return;
    const next = this.visibleRememberedBounds(bounds);
    if (next !== null) this.createMainWindow().setBounds(next);
  }

  completeOnboarding(): void {
    if (process.platform === "darwin" && !this.dockHidden) {
      app.dock?.hide();
      this.dockHidden = true;
    }
    if (this.tray !== undefined) return;
    this.tray = new Tray(statusIcon());
    this.tray.setToolTip("Kopper");
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Kopper", click: () => this.show() },
        {
          label: "Capture Selection",
          click: () => this.options.requestCapture?.(),
        },
        { label: "Settings…", click: () => this.openSettings() },
        { type: "separator" },
        { label: "Quit", click: () => this.quit() },
      ]),
    );
  }

  openSettings(): void {
    this.show();
    this.options.openSettings?.();
  }

  sendToMain(channel: string, ...args: unknown[]): void {
    const window = this.mainWindow;
    if (window === undefined || window.isDestroyed()) return;
    window.webContents.send(channel, ...args);
  }

  beginQuit(): void {
    this.quitting = true;
    this.captureHud.dispose();
  }

  flushBounds(): Promise<void> {
    if (this.boundsTimer !== undefined) clearTimeout(this.boundsTimer);
    this.boundsTimer = undefined;
    const bounds = this.pendingBounds;
    this.pendingBounds = undefined;
    if (bounds === undefined) return this.boundsPersistenceTail;

    const persistence = this.boundsPersistenceTail.then(() =>
      this.persistBounds(bounds),
    );
    this.boundsPersistenceTail = persistence.then(
      () => undefined,
      () => undefined,
    );
    return persistence;
  }

  quit(): void {
    if (!this.quitting) app.quit();
  }

  dispose(): void {
    this.quitting = true;
    this.captureHud.dispose();
    if (this.boundsTimer !== undefined) clearTimeout(this.boundsTimer);
    this.boundsTimer = undefined;
    this.pendingBounds = undefined;
    this.tray?.destroy();
    this.tray = undefined;
  }

  private notifyWindowCreated(window: BrowserWindow): void {
    for (const listener of this.windowCreatedListeners) listener(window);
  }

  private initialPanelBounds(remembered: WindowBounds | null): WindowBounds {
    const rememberedBounds =
      remembered === null ? null : this.visibleRememberedBounds(remembered);
    if (rememberedBounds !== null) return rememberedBounds;
    const workArea = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    ).workArea;
    return clamp(
      {
        x: workArea.x + workArea.width - PANEL_WIDTH - EDGE_INSET,
        y: workArea.y + EDGE_INSET,
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
      },
      workArea,
    );
  }

  private visibleRememberedBounds(bounds: WindowBounds): WindowBounds | null {
    const display = screen
      .getAllDisplays()
      .find(({ workArea }) => intersects(bounds, workArea));
    return display === undefined ? null : clamp(bounds, display.workArea);
  }

  private scheduleBoundsPersistence(): void {
    const window = this.mainWindow;
    if (window === undefined || window.isDestroyed()) return;
    this.pendingBounds = window.getBounds();
    if (this.boundsTimer !== undefined) clearTimeout(this.boundsTimer);
    this.boundsTimer = setTimeout(() => {
      void this.flushBounds().catch(() => {
        // Later moves and controlled quit can retry after a persistence failure.
      });
    }, BOUNDS_DEBOUNCE_MS);
    this.boundsTimer.unref?.();
  }

}
