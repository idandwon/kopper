import { pathToFileURL } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  class FakeWindow {
    static instances: FakeWindow[] = [];
    readonly once = vi.fn((event: string, listener: () => void) => {
      this.listeners.set(event, listener);
      return this;
    });
    readonly loadURL = vi.fn().mockResolvedValue(undefined);
    readonly loadFile = vi.fn().mockResolvedValue(undefined);
    readonly webContents = {
      on: vi.fn(
        (
          event: string,
          listener: (event: { preventDefault(): void }, url: string) => void,
        ) => {
          this.webContentsListeners.set(event, listener);
        },
      ),
      setWindowOpenHandler: vi.fn((handler: () => { action: string }) => {
        this.windowOpenHandler = handler;
      }),
    };
    readonly webContentsListeners = new Map<
      string,
      (event: { preventDefault(): void }, url: string) => void
    >();
    windowOpenHandler: (() => { action: string }) | undefined;
    readonly show = vi.fn();
    readonly focus = vi.fn();
    readonly isDestroyed = vi.fn().mockReturnValue(false);
    readonly listeners = new Map<string, () => void>();

    constructor(readonly options: Record<string, unknown>) {
      FakeWindow.instances.push(this);
    }
  }
  return { FakeWindow };
});

vi.mock("electron", () => ({ BrowserWindow: electron.FakeWindow }));

import {
  createMainWindow,
  openExpandedEditorWindow,
} from "./createMainWindow";

beforeEach(() => {
  electron.FakeWindow.instances.length = 0;
  delete process.env.ELECTRON_RENDERER_URL;
});

describe("window navigation security", () => {
  it.each([
    ["main", () => createMainWindow()],
    ["editor", () => openExpandedEditorWindow("security-note")],
  ])(
    "guards the %s window against untrusted navigation and all popups",
    (_name, createWindow) => {
      const window = createWindow() as unknown as InstanceType<
        typeof electron.FakeWindow
      >;
      const willNavigate = window.webContentsListeners.get("will-navigate");
      expect(willNavigate).toBeDefined();

      const preventExternal = vi.fn();
      willNavigate?.(
        { preventDefault: preventExternal },
        "https://attacker.example/steal",
      );
      expect(preventExternal).toHaveBeenCalledOnce();

      const [rendererPath] = window.loadFile.mock.calls[0] as [string];
      const preventHashRoute = vi.fn();
      const trustedHashRoute = new URL(pathToFileURL(rendererPath));
      trustedHashRoute.hash = "editor=note-1";
      willNavigate?.(
        { preventDefault: preventHashRoute },
        trustedHashRoute.toString(),
      );
      expect(preventHashRoute).not.toHaveBeenCalled();

      expect(window.windowOpenHandler?.()).toEqual({ action: "deny" });
      window.listeners.get("closed")?.();
    },
  );
});

describe("expanded editor windows", () => {
  it("deduplicates by note ID, sends only the ID fragment, and releases on close", () => {
    const first = openExpandedEditorWindow("note-1") as unknown as InstanceType<typeof electron.FakeWindow>;
    const again = openExpandedEditorWindow("note-1") as unknown as InstanceType<typeof electron.FakeWindow>;

    expect(again).toBe(first);
    expect(electron.FakeWindow.instances).toHaveLength(1);
    expect(first.show).toHaveBeenCalledOnce();
    expect(first.focus).toHaveBeenCalledOnce();
    expect(first.loadFile).toHaveBeenCalledWith(expect.any(String), {
      hash: "editor=note-1",
    });
    expect(JSON.stringify(first.loadFile.mock.calls)).not.toContain("note body");
    expect(first.options).toMatchObject({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    first.listeners.get("closed")?.();
    const replacement = openExpandedEditorWindow("note-1");
    expect(replacement).not.toBe(first);
    expect(electron.FakeWindow.instances).toHaveLength(2);
  });
});
