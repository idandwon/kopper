import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  workers: process.platform === "darwin" ? 1 : undefined,
  use: {
    trace: "retain-on-failure",
  },
});
