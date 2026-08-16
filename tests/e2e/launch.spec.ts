import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { _electron as electron, expect, test } from "@playwright/test";

test("launches the secure Oxide Ledger renderer", async () => {
  const preloadPath = join(process.cwd(), "out/preload/index.js");
  const preloadBundle = await readFile(preloadPath, "utf8");
  const runtimeRequires = [...preloadBundle.matchAll(/\brequire\(["']([^"']+)["']\)/g)]
    .map((match) => match[1])
    .filter((dependency): dependency is string => dependency !== undefined);
  expect([...new Set(runtimeRequires)]).toEqual(["electron"]);

  const userDataDirectory = await mkdtemp(join(tmpdir(), "kopper-e2e-"));
  const electronApp = await electron.launch({
    args: [
      join(process.cwd(), "out/main/index.js"),
      `--user-data-dir=${userDataDirectory}`,
    ],
  });

  try {
    const page = await electronApp.firstWindow();

    await expect(page).toHaveTitle("Kopper");
    await expect(
      page.getByRole("searchbox", { name: "Search notes" }),
    ).toBeVisible();
    await expect(
      page.evaluate(() => typeof window.process),
    ).resolves.toBe("undefined");
  } finally {
    await electronApp.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});
