import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["src/{main,shared,preload}/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "renderer",
          environment: "jsdom",
          include: ["src/renderer/**/*.test.ts?(x)"],
        },
      },
    ],
  },
});
