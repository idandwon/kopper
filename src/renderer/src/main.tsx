import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { DocumentProvider } from "./app/DocumentProvider";
import "./styles/globals.css";
import { ThemeProvider } from "./theme/ThemeProvider";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Renderer root element was not found");
}

createRoot(root).render(
  <DocumentProvider>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </DocumentProvider>,
);
