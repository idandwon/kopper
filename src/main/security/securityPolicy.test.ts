import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({ isPackaged: true }));

vi.mock("electron", () => ({
  app: electron,
}));

import { installSecurityPolicy } from "./securityPolicy";

type NavigationListener = (
  event: { preventDefault(): void },
  navigationUrl: string,
) => void;
type RequestListener = (
  details: { url: string },
  callback: (response: { cancel?: boolean }) => void,
) => void;

class FakeWindow {
  navigationListeners = new Set<NavigationListener>();
  destroyedListeners = new Set<() => void>();
  openHandler: ((details: { url: string }) => { action: string }) | undefined;
  readonly webContents = {
    on: vi.fn((event: string, listener: NavigationListener | (() => void)) => {
      if (event === "will-navigate") {
        this.navigationListeners.add(listener as NavigationListener);
      } else if (event === "destroyed") {
        this.destroyedListeners.add(listener as () => void);
      }
    }),
    removeListener: vi.fn(
      (event: string, listener: NavigationListener | (() => void)) => {
        if (event === "will-navigate") {
          this.navigationListeners.delete(listener as NavigationListener);
        } else if (event === "destroyed") {
          this.destroyedListeners.delete(listener as () => void);
        }
      },
    ),
    setWindowOpenHandler: vi.fn(
      (handler: (details: { url: string }) => { action: string }) => {
        this.openHandler = handler;
      },
    ),
  };

  destroyWebContents() {
    for (const listener of [...this.destroyedListeners]) listener();
  }
}

class FakeWindows {
  readonly existing: FakeWindow[] = [];
  listeners = new Set<(window: FakeWindow) => void>();
  readonly rendererUrl: URL;

  constructor(rendererUrl: string) {
    this.rendererUrl = new URL(rendererUrl);
  }

  getWindows() {
    return this.existing;
  }

  onWindowCreated(listener: (window: FakeWindow) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  create() {
    const window = new FakeWindow();
    this.existing.push(window);
    for (const listener of this.listeners) listener(window);
    return window;
  }
}

function fakeSession() {
  let permissionRequest:
    | ((
        _webContents: unknown,
        permission: string,
        callback: (allowed: boolean) => void,
      ) => void)
    | null;
  let permissionCheck:
    | ((_webContents: unknown, permission: string) => boolean)
    | null;
  let requestListener: RequestListener | null;

  return {
    setPermissionRequestHandler: vi.fn((handler) => {
      permissionRequest = handler;
    }),
    setPermissionCheckHandler: vi.fn((handler) => {
      permissionCheck = handler;
    }),
    webRequest: {
      onBeforeRequest: vi.fn((listener) => {
        requestListener = listener;
      }),
    },
    permission(permission: string) {
      let allowed: boolean | undefined;
      permissionRequest?.({}, permission, (result) => {
        allowed = result;
      });
      return allowed;
    },
    permissionCheck(permission: string) {
      return permissionCheck?.({}, permission);
    },
    request(url: string) {
      let response: { cancel?: boolean } | undefined;
      requestListener?.({ url }, (result) => {
        response = result;
      });
      return response;
    },
  };
}

function navigate(window: FakeWindow, url: string) {
  const preventDefault = vi.fn();
  for (const listener of window.navigationListeners) {
    listener({ preventDefault }, url);
  }
  return preventDefault;
}

beforeEach(() => {
  electron.isPackaged = true;
});

describe("installSecurityPolicy", () => {
  it("permits only the exact packaged renderer document and applies to every window", () => {
    const session = fakeSession();
    const windows = new FakeWindows(
      "file:///Applications/Kopper.app/Contents/Resources/app.asar/out/renderer/index.html",
    );
    const existing = windows.create();

    installSecurityPolicy(session as never, windows as never);
    const editor = windows.create();

    expect(navigate(existing, windows.rendererUrl.href)).not.toHaveBeenCalled();
    expect(
      navigate(editor, `${windows.rendererUrl.href}#editor=note-1`),
    ).not.toHaveBeenCalled();
    expect(
      navigate(editor, `${windows.rendererUrl.href}?remote=true`),
    ).toHaveBeenCalledOnce();
    expect(
      navigate(
        editor,
        "file://remote-host/Applications/Kopper.app/Contents/Resources/app.asar/out/renderer/index.html",
      ),
    ).toHaveBeenCalledOnce();
    expect(navigate(editor, "https://example.invalid")).toHaveBeenCalledOnce();
  });

  it("allows only the exact electron-vite origin in development", () => {
    electron.isPackaged = false;
    const session = fakeSession();
    const windows = new FakeWindows("http://127.0.0.1:5173/");
    installSecurityPolicy(session as never, windows as never);
    const window = windows.create();

    expect(
      navigate(window, "http://127.0.0.1:5173/editor#note-1"),
    ).not.toHaveBeenCalled();
    expect(navigate(window, "http://localhost:5173/")).toHaveBeenCalledOnce();
    expect(navigate(window, "https://127.0.0.1:5173/")).toHaveBeenCalledOnce();
  });

  it("denies every popup without opening an external URL", () => {
    const session = fakeSession();
    const windows = new FakeWindows("file:///app/out/renderer/index.html");
    installSecurityPolicy(session as never, windows as never);
    const window = windows.create();

    expect(window.openHandler?.({ url: windows.rendererUrl.href })).toEqual({
      action: "deny",
    });
    expect(
      window.openHandler?.({ url: "https://example.invalid/private-note" }),
    ).toEqual({ action: "deny" });
  });

  it.each([
    "clipboard-read",
    "clipboard-sanitized-write",
    "display-capture",
    "fileSystem",
    "fullscreen",
    "geolocation",
    "idle-detection",
    "keyboardLock",
    "media",
    "mediaKeySystem",
    "midi",
    "midiSysex",
    "notifications",
    "openExternal",
    "pointerLock",
    "speaker-selection",
    "storage-access",
    "top-level-storage-access",
    "unknown",
    "window-management",
  ])("denies renderer permission %s", (permission) => {
    const session = fakeSession();
    const windows = new FakeWindows("file:///app/out/renderer/index.html");
    installSecurityPolicy(session as never, windows as never);

    expect(session.permission(permission)).toBe(false);
    expect(session.permissionCheck(permission)).toBe(false);
  });

  it.each(["http", "https", "ws", "wss"])(
    "cancels production %s requests",
    (protocol) => {
      const session = fakeSession();
      const windows = new FakeWindows("file:///app/out/renderer/index.html");
      installSecurityPolicy(session as never, windows as never);

      expect(session.request(`${protocol}://example.invalid/private`)).toEqual({
        cancel: true,
      });
    },
  );

  it("allows only packaged renderer assets and explicit local schemes", () => {
    const session = fakeSession();
    const windows = new FakeWindows("file:///app/out/renderer/index.html");
    installSecurityPolicy(session as never, windows as never);

    expect(session.request("file:///app/out/renderer/assets/index.js")).toEqual(
      {
        cancel: false,
      },
    );
    expect(session.request("data:image/png;base64,AA==")).toEqual({
      cancel: false,
    });
    expect(session.request("file:///Users/person/private-note.txt")).toEqual({
      cancel: true,
    });
    expect(session.request("devtools://devtools/bundled/index.html")).toEqual({
      cancel: true,
    });
  });

  it.each([
    "data:text/html,<script>alert(1)</script>",
    "data:text/javascript,alert(1)",
    "data:application/javascript,alert(1)",
    "data:text/plain,private-note",
    "data:,private-note",
  ])("rejects non-image data request %s", (url) => {
    const session = fakeSession();
    const windows = new FakeWindows("file:///app/out/renderer/index.html");
    installSecurityPolicy(session as never, windows as never);

    expect(session.request(url)).toEqual({ cancel: true });
  });

  it("defines trusted packaged blob forms and rejects remote blob origins", () => {
    const session = fakeSession();
    const windows = new FakeWindows("file:///app/out/renderer/index.html");
    installSecurityPolicy(session as never, windows as never);

    expect(
      session.request("blob:file:///4d96d9da-7536-4f2b-aafd-98642290a709"),
    ).toEqual({
      cancel: false,
    });
    expect(
      session.request("blob:null/4d96d9da-7536-4f2b-aafd-98642290a709"),
    ).toEqual({
      cancel: false,
    });
    expect(
      session.request(
        "blob:https://example.invalid/4d96d9da-7536-4f2b-aafd-98642290a709",
      ),
    ).toEqual({
      cancel: true,
    });
    expect(
      session.request(
        "blob:http://127.0.0.1:5173/4d96d9da-7536-4f2b-aafd-98642290a709",
      ),
    ).toEqual({
      cancel: true,
    });
  });

  it("allows development blobs only from the exact renderer origin", () => {
    electron.isPackaged = false;
    const session = fakeSession();
    const windows = new FakeWindows("http://127.0.0.1:5173/");
    installSecurityPolicy(session as never, windows as never);

    expect(
      session.request(
        "blob:http://127.0.0.1:5173/4d96d9da-7536-4f2b-aafd-98642290a709",
      ),
    ).toEqual({
      cancel: false,
    });
    expect(
      session.request(
        "blob:http://localhost:5173/4d96d9da-7536-4f2b-aafd-98642290a709",
      ),
    ).toEqual({
      cancel: true,
    });
    expect(
      session.request("blob:null/4d96d9da-7536-4f2b-aafd-98642290a709"),
    ).toEqual({
      cancel: true,
    });
    expect(
      session.request("blob:file:///4d96d9da-7536-4f2b-aafd-98642290a709"),
    ).toEqual({
      cancel: true,
    });
  });

  it("allows the exact development origin, its websocket, and development DevTools", () => {
    electron.isPackaged = false;
    const session = fakeSession();
    const windows = new FakeWindows("http://127.0.0.1:5173/");
    installSecurityPolicy(session as never, windows as never);

    expect(session.request("http://127.0.0.1:5173/src/main.tsx")).toEqual({
      cancel: false,
    });
    expect(session.request("ws://127.0.0.1:5173/hmr")).toEqual({
      cancel: false,
    });
    expect(session.request("devtools://devtools/bundled/index.html")).toEqual({
      cancel: false,
    });
    expect(session.request("http://localhost:5173/src/main.tsx")).toEqual({
      cancel: true,
    });
  });

  it("logs only fixed event names and never URLs, note bodies, clipboard values, imported content, or native errors", () => {
    const session = fakeSession();
    const windows = new FakeWindows("file:///app/out/renderer/index.html");
    const log = vi.fn();
    installSecurityPolicy(session as never, windows as never, { log });
    const window = windows.create();
    const sensitive = [
      "private note body",
      "clipboard secret",
      "imported file contents",
      "native failure details",
    ];

    navigate(window, `https://example.invalid/${sensitive.join("/")}`);
    session.request(`https://example.invalid/${sensitive.join("/")}`);
    window.openHandler?.({
      url: `https://example.invalid/${sensitive.join("/")}`,
    });

    expect(log.mock.calls).toEqual([
      ["navigation-blocked"],
      ["request-blocked"],
      ["popup-blocked"],
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain(sensitive.join("/"));
    for (const value of sensitive) {
      expect(JSON.stringify(log.mock.calls)).not.toContain(value);
    }
  });

  it("releases each dynamic window listener when its web contents is destroyed", () => {
    const session = fakeSession();
    const windows = new FakeWindows("file:///app/out/renderer/index.html");
    const cleanup = installSecurityPolicy(session as never, windows as never);
    const editors = Array.from({ length: 20 }, () => windows.create());

    for (const editor of editors) editor.destroyWebContents();
    cleanup();

    for (const editor of editors) {
      expect(editor.navigationListeners).toHaveLength(0);
      expect(editor.destroyedListeners).toHaveLength(0);
      expect(editor.webContents.removeListener).toHaveBeenCalledTimes(2);
      expect(editor.webContents.removeListener).toHaveBeenCalledWith(
        "will-navigate",
        expect.any(Function),
      );
      expect(editor.webContents.removeListener).toHaveBeenCalledWith(
        "destroyed",
        expect.any(Function),
      );
      expect(editor.openHandler?.({ url: "https://example.invalid" })).toEqual({
        action: "deny",
      });
    }
  });

  it("cleans session and window handlers once and is idempotent", () => {
    const session = fakeSession();
    const windows = new FakeWindows("file:///app/out/renderer/index.html");
    const existing = windows.create();
    const cleanup = installSecurityPolicy(session as never, windows as never);

    cleanup();
    cleanup();
    const afterCleanup = windows.create();

    expect(existing.webContents.removeListener).toHaveBeenCalledTimes(2);
    expect(session.setPermissionRequestHandler).toHaveBeenLastCalledWith(null);
    expect(session.setPermissionCheckHandler).toHaveBeenLastCalledWith(null);
    expect(session.webRequest.onBeforeRequest).toHaveBeenLastCalledWith(null);
    expect(session.setPermissionRequestHandler).toHaveBeenCalledTimes(2);
    expect(session.webRequest.onBeforeRequest).toHaveBeenCalledTimes(2);
    expect(afterCleanup.webContents.on).not.toHaveBeenCalled();
  });
});
