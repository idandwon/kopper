import { createRoot } from "react-dom/client";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Renderer root element was not found");
}

createRoot(root).render(<main>Kopper</main>);
