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
  const noFailure = Symbol("no failure");
  let electronApp: Awaited<ReturnType<typeof electron.launch>> | undefined;
  let primaryFailure: unknown | typeof noFailure = noFailure;
  let cleanupFailure: unknown | typeof noFailure = noFailure;

  try {
    electronApp = await electron.launch({
      args: [
        join(process.cwd(), "out/main/index.js"),
        `--user-data-dir=${userDataDirectory}`,
      ],
    });

    const page = await electronApp.firstWindow();

    await expect(page).toHaveTitle("Kopper");
    await expect(
      page.getByRole("searchbox", { name: "Search notes" }),
    ).toBeVisible();
    await expect(
      page.evaluate(() => typeof window.process),
    ).resolves.toBe("undefined");
  } catch (error) {
    primaryFailure = error;
  } finally {
    try {
      await electronApp?.close();
    } catch (error) {
      cleanupFailure = error;
    } finally {
      try {
        await rm(userDataDirectory, { recursive: true, force: true });
      } catch (error) {
        if (cleanupFailure === noFailure) {
          cleanupFailure = error;
        }
      }
    }
  }

  if (primaryFailure !== noFailure) {
    throw primaryFailure;
  }
  if (cleanupFailure !== noFailure) {
    throw cleanupFailure;
  }
});
