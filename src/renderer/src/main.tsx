import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { DocumentProvider } from "./app/DocumentProvider";
import { CaptureToast } from "./features/capture/CaptureToast";
import "./styles/globals.css";
import { ThemeProvider } from "./theme/ThemeProvider";

const root = document.getElementById("root");
const captureHud = globalThis.location.hash === "#capture-hud";

if (!root) {
  throw new Error("Renderer root element was not found");
}

createRoot(root).render(
  <DocumentProvider>
    <ThemeProvider>{captureHud ? <CaptureToast /> : <App />}</ThemeProvider>
  </DocumentProvider>,
);
