import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {},
  preload: {
    build: {
      externalizeDeps: false,
    },
  },
  renderer: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@renderer": fileURLToPath(
          new URL("./src/renderer/src", import.meta.url),
        ),
      },
    },
  },
});
