import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  workers: 1,
  fullyParallel: false,
  use: {
    trace: "retain-on-failure",
  },
});
