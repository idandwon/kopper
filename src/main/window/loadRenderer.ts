import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserWindow } from "electron";

function localRendererPath(rendererUrl: URL): string {
  try {
    return fileURLToPath(rendererUrl);
  } catch {
    return join(__dirname, "../renderer/index.html");
  }
}

export function loadRenderer(
  window: BrowserWindow,
  rendererUrl: URL,
  hash?: string,
): void {
  if (rendererUrl.protocol === "file:") {
    void window.loadFile(
      localRendererPath(rendererUrl),
      hash === undefined ? undefined : { hash },
    );
    return;
  }

  const developmentUrl = URL.parse(rendererUrl.toString());
  if (developmentUrl === null) {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
    return;
  }
  if (hash !== undefined) developmentUrl.hash = hash;
  void window.loadURL(developmentUrl.toString());
}
