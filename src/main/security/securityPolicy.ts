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

function isImageDataUrl(requested: URL): boolean {
  const comma = requested.href.indexOf(",");
  if (comma < 0) return false;
  const metadata = requested.href.slice("data:".length, comma);
  const mimeType = metadata.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return /^image\/[a-z0-9.+-]+$/u.test(mimeType);
}

function isTrustedBlob(requested: URL, rendererUrl: URL): boolean {
  const embedded = requested.href.slice("blob:".length);
  if (!app.isPackaged) {
    if (!["http:", "https:"].includes(rendererUrl.protocol)) return false;
    try {
      return new URL(embedded).origin === rendererUrl.origin;
    } catch {
      return false;
    }
  }

  if (rendererUrl.protocol !== "file:") return false;
  if (/^null\/[^/?#]+$/u.test(embedded)) return true;
  try {
    const blobOrigin = new URL(embedded);
    return (
      blobOrigin.protocol === "file:" &&
      blobOrigin.hostname === "" &&
      blobOrigin.username === "" &&
      blobOrigin.password === ""
    );
  } catch {
    return false;
  }
}

function isRequestAllowed(requestUrl: string, rendererUrl: URL): boolean {
  let requested: URL;
  try {
    requested = new URL(requestUrl);
  } catch {
    return false;
  }

  if (isRendererFile(requested, rendererUrl)) return true;
  if (requested.protocol === "data:") return isImageDataUrl(requested);
  if (requested.href === "about:blank") return true;
  if (!app.isPackaged && requested.protocol === "devtools:") return true;
  if (requested.protocol === "blob:") {
    return isTrustedBlob(requested, rendererUrl);
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
    {
      navigation: (event: Electron.Event, navigationUrl: string) => void;
      destroyed: () => void;
    }
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
    const webContents = window.webContents;
    const destroyedListener = () => {
      const listeners = navigationListeners.get(window);
      if (
        listeners?.navigation !== navigationListener ||
        listeners.destroyed !== destroyedListener
      ) {
        return;
      }
      webContents.removeListener("will-navigate", navigationListener);
      webContents.removeListener("destroyed", destroyedListener);
      navigationListeners.delete(window);
    };
    navigationListeners.set(window, {
      navigation: navigationListener,
      destroyed: destroyedListener,
    });
    webContents.on("will-navigate", navigationListener);
    webContents.on("destroyed", destroyedListener);
    webContents.setWindowOpenHandler(() => {
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
    for (const [window, listeners] of navigationListeners) {
      window.webContents.removeListener("will-navigate", listeners.navigation);
      window.webContents.removeListener("destroyed", listeners.destroyed);
    }
    navigationListeners.clear();
    session.setPermissionRequestHandler(null);
    session.setPermissionCheckHandler(null);
    session.webRequest.onBeforeRequest(null);
    installedSessions.delete(session);
  };
}
