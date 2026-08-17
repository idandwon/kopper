import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { DocumentProvider } from "./app/DocumentProvider";
import { CaptureToast } from "./features/capture/CaptureToast";
import { rendererSurface } from "./rendererSurface";
import "./styles/globals.css";
import { ThemeProvider } from "./theme/ThemeProvider";

const surface = rendererSurface(globalThis.location.hash);
const captureHud = surface === "capture-hud";
document.documentElement.dataset.rendererSurface = surface;
const root = document.getElementById("root");

if (!root) {
  throw new Error("Renderer root element was not found");
}

createRoot(root).render(
  <DocumentProvider>
    <ThemeProvider>{captureHud ? <CaptureToast /> : <App />}</ThemeProvider>
  </DocumentProvider>,
);
