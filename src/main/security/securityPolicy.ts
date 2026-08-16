import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  type BrowserWindow,
  type OnBeforeRequestListenerDetails,
  type Session,
} from "electron";

export type SecurityPolicyEvent =
  | "navigation-blocked"
  | "popup-blocked"
  | "request-blocked";

export interface SecurityWindowRegistry {
  readonly rendererUrl: URL;
  getWindows(): BrowserWindow[];
  onWindowCreated(listener: (window: BrowserWindow) => void): () => void;
}

export interface SecurityPolicyOptions {
  log?(event: SecurityPolicyEvent): void;
}

const installedSessions = new WeakSet<Session>();

function samePackagedDocument(requested: URL, rendererUrl: URL): boolean {
  if (requested.protocol !== "file:" || rendererUrl.protocol !== "file:") {
    return false;
  }
  const expected = new URL(rendererUrl);
  expected.hash = "";
  requested.hash = "";
  return requested.href === expected.href;
}

function isNavigationAllowed(navigationUrl: string, rendererUrl: URL): boolean {
  try {
    const requested = new URL(navigationUrl);
    if (app.isPackaged) return samePackagedDocument(requested, rendererUrl);
    if (rendererUrl.protocol === "file:") {
      return samePackagedDocument(requested, rendererUrl);
    }
    return requested.origin === rendererUrl.origin;
  } catch {
    return false;
  }
}

function isRendererFile(requested: URL, rendererUrl: URL): boolean {
  if (requested.protocol !== "file:" || rendererUrl.protocol !== "file:") {
    return false;
  }
  try {
    const rendererDirectory = dirname(fileURLToPath(rendererUrl));
    const candidate = fileURLToPath(requested);
    const fromRenderer = relative(rendererDirectory, candidate);
    return (
      fromRenderer === "" ||
      (!fromRenderer.startsWith("..") && fromRenderer !== "..")
    );
  } catch {
    return false;
  }
}

function developmentNetworkOrigins(rendererUrl: URL): ReadonlySet<string> {
  if (app.isPackaged || !["http:", "https:"].includes(rendererUrl.protocol)) {
    return new Set();
  }
  const websocket = new URL(rendererUrl.origin);
  websocket.protocol = rendererUrl.protocol === "https:" ? "wss:" : "ws:";
  return new Set([rendererUrl.origin, websocket.origin]);
}

function isRequestAllowed(requestUrl: string, rendererUrl: URL): boolean {
  let requested: URL;
  try {
    requested = new URL(requestUrl);
  } catch {
    return false;
  }

  if (isRendererFile(requested, rendererUrl)) return true;
  if (requested.protocol === "data:") return true;
  if (requested.href === "about:blank") return true;
  if (!app.isPackaged && requested.protocol === "devtools:") return true;

  if (requested.protocol === "blob:") {
    try {
      return isRequestAllowed(requested.href.slice("blob:".length), rendererUrl);
    } catch {
      return false;
    }
  }

  return developmentNetworkOrigins(rendererUrl).has(requested.origin);
}

/**
 * Installs one local-only policy for the default renderer session and every
 * BrowserWindow registered by WindowManager. The optional logger receives only
 * fixed event names; URLs, user content, and native errors never cross it.
 */
export function installSecurityPolicy(
  session: Session,
  windows: SecurityWindowRegistry,
  options: SecurityPolicyOptions = {},
): () => void {
  if (installedSessions.has(session)) {
    throw new Error("Security policy is already installed for this session.");
  }
  installedSessions.add(session);

  const navigationListeners = new Map<
    BrowserWindow,
    (event: Electron.Event, navigationUrl: string) => void
  >();
  let disposed = false;

  const secureWindow = (window: BrowserWindow) => {
    if (disposed || navigationListeners.has(window)) return;
    const navigationListener = (
      event: Electron.Event,
      navigationUrl: string,
    ) => {
      if (isNavigationAllowed(navigationUrl, windows.rendererUrl)) return;
      event.preventDefault();
      options.log?.("navigation-blocked");
    };
    navigationListeners.set(window, navigationListener);
    window.webContents.on("will-navigate", navigationListener);
    window.webContents.setWindowOpenHandler(() => {
      options.log?.("popup-blocked");
      return { action: "deny" };
    });
  };

  const unsubscribeWindowCreated = windows.onWindowCreated(secureWindow);
  for (const window of windows.getWindows()) secureWindow(window);

  session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.setPermissionCheckHandler(() => false);
  session.webRequest.onBeforeRequest(
    (details: OnBeforeRequestListenerDetails, callback) => {
      const allowed = isRequestAllowed(details.url, windows.rendererUrl);
      if (!allowed) options.log?.("request-blocked");
      callback({ cancel: !allowed });
    },
  );

  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribeWindowCreated();
    for (const [window, listener] of navigationListeners) {
      window.webContents.removeListener("will-navigate", listener);
    }
    navigationListeners.clear();
    session.setPermissionRequestHandler(null);
    session.setPermissionCheckHandler(null);
    session.webRequest.onBeforeRequest(null);
    installedSessions.delete(session);
  };
}
