import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  class FakeWindow {
    static instances: FakeWindow[] = [];
    readonly listeners = new Map<string, Array<(...args: any[]) => void>>();
    readonly webContentsListeners = new Map<string, (...args: any[]) => void>();
    readonly webContents = {
      on: vi.fn((event: string, listener: (...args: any[]) => void) => {
        this.webContentsListeners.set(event, listener);
      }),
      setWindowOpenHandler: vi.fn(),
      send: vi.fn(),
    };
    readonly loadURL = vi.fn().mockResolvedValue(undefined);
    readonly loadFile = vi.fn().mockResolvedValue(undefined);
    readonly setVisibleOnAllWorkspaces = vi.fn();
    readonly setAlwaysOnTop = vi.fn((pinned: boolean) => {
      this.alwaysOnTop = pinned;
    });
    readonly isAlwaysOnTop = vi.fn(() => this.alwaysOnTop);
    readonly showInactive = vi.fn(() => {
      this.visible = true;
    });
    readonly show = vi.fn(() => {
      this.visible = true;
    });
    readonly hide = vi.fn(() => {
      this.visible = false;
      this.focused = false;
    });
    readonly focus = vi.fn(() => {
      this.focused = true;
    });
    readonly isVisible = vi.fn(() => this.visible);
    readonly isFocused = vi.fn(() => this.focused);
    readonly isDestroyed = vi.fn(() => this.destroyed);
    readonly destroy = vi.fn(() => {
      this.destroyed = true;
      this.visible = false;
    });
    readonly setIgnoreMouseEvents = vi.fn();
    readonly getBounds = vi.fn(() => ({ ...this.bounds }));
    readonly setBounds = vi.fn((bounds: any) => {
      this.bounds = { ...bounds };
    });
    visible = false;
    focused = false;
    alwaysOnTop = false;
    destroyed = false;
    bounds: { x: number; y: number; width: number; height: number };

    constructor(readonly options: Record<string, any>) {
      this.bounds = {
        x: options.x,
        y: options.y,
        width: options.width,
        height: options.height,
      };
      FakeWindow.instances.push(this);
    }

    on(event: string, listener: (...args: any[]) => void) {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
      return this;
    }
    once(event: string, listener: (...args: any[]) => void) {
      return this.on(event, listener);
    }
    emit(event: string, ...args: any[]) {
      for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }
  }

  class FakeTray {
    static instances: FakeTray[] = [];
    readonly setToolTip = vi.fn();
    readonly setContextMenu = vi.fn();
    readonly destroy = vi.fn();
    constructor(readonly icon: unknown) {
      FakeTray.instances.push(this);
    }
  }

  return {
    FakeWindow,
    FakeTray,
    quit: vi.fn(),
    dockHide: vi.fn(),
    isPackaged: true,
    menu: vi.fn((template: unknown) => template),
    image: { setTemplateImage: vi.fn() },
    displays: [{ workArea: { x: 0, y: 0, width: 1440, height: 900 } }],
  };
});

vi.mock("electron", () => ({
  app: {
    quit: electron.quit,
    dock: { hide: electron.dockHide },
    get isPackaged() {
      return electron.isPackaged;
    },
  },
  BrowserWindow: electron.FakeWindow,
  Menu: { buildFromTemplate: electron.menu },
  nativeImage: { createFromDataURL: () => electron.image },
  screen: {
    getCursorScreenPoint: () => ({ x: 1200, y: 100 }),
    getDisplayNearestPoint: () => electron.displays[0],
    getAllDisplays: () => electron.displays,
  },
  Tray: electron.FakeTray,
}));

import { WindowManager } from "./windowManager";

beforeEach(() => {
  vi.useFakeTimers();
  electron.FakeWindow.instances.length = 0;
  electron.FakeTray.instances.length = 0;
  electron.quit.mockReset();
  electron.dockHide.mockReset();
  electron.isPackaged = true;
  delete process.env.ELECTRON_RENDERER_URL;
  electron.menu.mockClear();
  electron.displays.splice(0, electron.displays.length, {
    workArea: { x: 0, y: 0, width: 1440, height: 900 },
  });
});

describe("WindowManager", () => {
  it("creates the secure floating panel at the active display right inset", () => {
    const manager = new WindowManager();
    const window = manager.createMainWindow() as unknown as InstanceType<
      typeof electron.FakeWindow
    >;

    expect(window.options).toMatchObject({
      x: 1036,
      y: 24,
      width: 380,
      height: 640,
      minWidth: 340,
      minHeight: 480,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: true,
      vibrancy: "popover",
      visualEffectState: "active",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    expect(window.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
      visibleOnFullScreen: true,
    });
  });

  it("ignores a renderer environment URL in a packaged application", () => {
    process.env.ELECTRON_RENDERER_URL = "https://example.invalid/remote";

    const manager = new WindowManager();
    const window = manager.createMainWindow() as unknown as InstanceType<
      typeof electron.FakeWindow
    >;

    expect(manager.rendererUrl.protocol).toBe("file:");
    expect(window.loadURL).not.toHaveBeenCalled();
    expect(window.loadFile).toHaveBeenCalledOnce();
  });

  it("falls back to the local renderer for invalid development configuration", () => {
    electron.isPackaged = false;
    process.env.ELECTRON_RENDERER_URL = "not a URL";

    const manager = new WindowManager();
    const window = manager.createMainWindow() as unknown as InstanceType<
      typeof electron.FakeWindow
    >;

    expect(manager.rendererUrl.protocol).toBe("file:");
    expect(window.loadFile).toHaveBeenCalledOnce();
  });

  it("registers the secure main and editor preferences at window creation", () => {
    const manager = new WindowManager();
    const created = vi.fn();
    manager.onWindowCreated(created);

    const main = manager.createMainWindow() as unknown as InstanceType<
      typeof electron.FakeWindow
    >;
    const editor = manager.openExpandedEditorWindow("note-1") as unknown as InstanceType<
      typeof electron.FakeWindow
    >;

    expect(created.mock.calls).toEqual([[main], [editor]]);
    expect(main.options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
    expect(editor.options.webPreferences).toEqual(main.options.webPreferences);
  });

  it("uses only visible remembered bounds and clamps them to the intersecting work area", () => {
    electron.displays.splice(0, 1, {
      workArea: { x: 100, y: 50, width: 800, height: 600 },
    });
    const remembered = new WindowManager({
      initialBounds: { x: 850, y: 550, width: 380, height: 640 },
    }).createMainWindow() as unknown as InstanceType<typeof electron.FakeWindow>;
    expect(remembered.bounds).toEqual({ x: 520, y: 50, width: 380, height: 600 });

    const offscreen = new WindowManager({
      initialBounds: { x: -2000, y: -2000, width: 380, height: 640 },
    }).createMainWindow() as unknown as InstanceType<typeof electron.FakeWindow>;
    expect(offscreen.bounds).toEqual({ x: 496, y: 50, width: 380, height: 600 });
  });

  it("hides rather than closes the main panel, while quit permits close", () => {
    const manager = new WindowManager();
    const window = manager.createMainWindow() as unknown as InstanceType<typeof electron.FakeWindow>;
    const preventDefault = vi.fn();
    window.emit("close", { preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(window.hide).toHaveBeenCalledOnce();

    manager.beginQuit();
    const quittingPreventDefault = vi.fn();
    window.emit("close", { preventDefault: quittingPreventDefault });
    expect(quittingPreventDefault).not.toHaveBeenCalled();
  });

  it("shows a click-through capture HUD while leaving the hidden panel hidden", () => {
    const manager = new WindowManager();
    manager.createMainWindow();
    const mainWindow = electron.FakeWindow.instances[0];
    expect(mainWindow).toBeDefined();
    if (mainWindow === undefined) return;
    mainWindow.emit("ready-to-show");
    mainWindow.visible = false;
    mainWindow.show.mockClear();
    manager.showCaptureOutcome({ status: "captured", noteId: "note-1" });

    const hudWindow = electron.FakeWindow.instances[1];
    expect(hudWindow).toBeDefined();
    if (hudWindow === undefined) return;
    expect(mainWindow.showInactive).not.toHaveBeenCalled();
    expect(mainWindow.show).not.toHaveBeenCalled();
    expect(mainWindow.focus).not.toHaveBeenCalled();
    expect(hudWindow.options).toMatchObject({
      width: 240,
      height: 72,
      frame: false,
      transparent: true,
      focusable: false,
      resizable: false,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    expect(hudWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
    expect(hudWindow.loadFile).toHaveBeenCalledWith(expect.any(String), {
      hash: "capture-hud",
    });

    hudWindow.emit("ready-to-show");
    expect(hudWindow.webContents.send).toHaveBeenCalledWith(
      "kopper:capture:outcome",
      { status: "captured", noteId: "note-1" },
    );
    expect(hudWindow.showInactive).toHaveBeenCalledOnce();
    expect(manager.getWindows()).toEqual([mainWindow, hudWindow]);
    expect(manager.getContentWindows()).toStrictEqual([mainWindow]);

    vi.advanceTimersByTime(1_800);
    expect(hudWindow.hide).toHaveBeenCalledOnce();
    expect(mainWindow.hide).not.toHaveBeenCalled();
  });

  it("queues only the latest capture outcome until the HUD is ready", () => {
    const manager = new WindowManager();
    manager.showCaptureOutcome({ status: "empty" });
    manager.showCaptureOutcome({
      status: "failed",
      error: {
        code: "capture_timeout",
        message: "The source app did not provide text",
        retryable: true,
      },
    });

    const hudWindow = electron.FakeWindow.instances[0];
    expect(hudWindow).toBeDefined();
    if (hudWindow === undefined) return;
    expect(electron.FakeWindow.instances).toHaveLength(1);
    expect(hudWindow.webContents.send).not.toHaveBeenCalled();

    hudWindow.emit("ready-to-show");

    expect(hudWindow.webContents.send).toHaveBeenCalledOnce();
    expect(hudWindow.webContents.send).toHaveBeenCalledWith(
      "kopper:capture:outcome",
      {
        status: "failed",
        error: {
          code: "capture_timeout",
          message: "The source app did not provide text",
          retryable: true,
        },
      },
    );
  });

  it("keeps normal panel toggling independent from the capture HUD", () => {
    const manager = new WindowManager();
    manager.createMainWindow();
    const mainWindow = electron.FakeWindow.instances[0];
    expect(mainWindow).toBeDefined();
    if (mainWindow === undefined) return;
    mainWindow.emit("ready-to-show");
    mainWindow.visible = true;
    mainWindow.show.mockClear();

    manager.showCaptureOutcome({ status: "empty" });
    expect(mainWindow.showInactive).not.toHaveBeenCalled();

    manager.toggle();
    expect(mainWindow.hide).toHaveBeenCalledOnce();
    manager.toggle();
    expect(mainWindow.show).toHaveBeenCalledOnce();
    expect(mainWindow.focus).toHaveBeenCalledOnce();
  });

  it("debounces bounds persistence and flushes it before hide", async () => {
    const persistBounds = vi.fn();
    const manager = new WindowManager({ persistBounds });
    const window = manager.createMainWindow() as unknown as InstanceType<typeof electron.FakeWindow>;
    window.bounds = { x: 900, y: 30, width: 360, height: 600 };
    window.emit("move");
    window.emit("resize");
    expect(persistBounds).not.toHaveBeenCalled();
    manager.hide();
    await manager.flushBounds();
    expect(persistBounds).toHaveBeenCalledExactlyOnceWith(window.bounds);
  });

  it("returns a final bounds flush promise that settles with deferred persistence", async () => {
    let resolvePersist!: () => void;
    const persistBounds = vi.fn(
      () => new Promise<void>((resolve) => { resolvePersist = resolve; }),
    );
    const manager = new WindowManager({ persistBounds });
    const window = manager.createMainWindow() as unknown as InstanceType<typeof electron.FakeWindow>;
    window.bounds = { x: 700, y: 40, width: 380, height: 620 };
    window.emit("move");

    let flushed = false;
    const flushing = manager.flushBounds().then(() => { flushed = true; });
    await Promise.resolve();
    expect(flushed).toBe(false);
    resolvePersist();
    await flushing;
    expect(flushed).toBe(true);
  });

  it("deduplicates editor windows and keeps their close behavior normal", () => {
    const manager = new WindowManager();
    const first = manager.openExpandedEditorWindow("note-1") as unknown as InstanceType<typeof electron.FakeWindow>;
    const again = manager.openExpandedEditorWindow("note-1");
    expect(again).toBe(first);
    expect(first.show).toHaveBeenCalledOnce();
    expect(first.focus).toHaveBeenCalledOnce();
    expect(first.loadFile).toHaveBeenCalledWith(expect.any(String), {
      hash: "editor=note-1",
    });
    expect(first.listeners.has("close")).toBe(false);
    first.emit("closed");
    expect(manager.openExpandedEditorWindow("note-1")).not.toBe(first);
  });

  it("creates one fixed template status item with shared lifecycle actions", () => {
    const requestCapture = vi.fn();
    const openSettings = vi.fn();
    const manager = new WindowManager({ requestCapture, openSettings });
    manager.createMainWindow();
    manager.completeOnboarding();
    manager.completeOnboarding();

    expect(electron.FakeTray.instances).toHaveLength(1);
    expect(electron.image.setTemplateImage).toHaveBeenCalledWith(true);
    const template = electron.menu.mock.calls[0]?.[0] as Array<{
      label?: string;
      click?: () => void;
    }>;
    template.find(({ label }) => label === "Capture Selection")?.click?.();
    template.find(({ label }) => label === "Settings…")?.click?.();
    template.find(({ label }) => label === "Quit")?.click?.();
    expect(requestCapture).toHaveBeenCalledOnce();
    expect(openSettings).toHaveBeenCalledOnce();
    expect(electron.quit).toHaveBeenCalledOnce();
  });
});
