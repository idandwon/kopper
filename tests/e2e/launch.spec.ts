import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  _electron as electron,
  expect,
  test as base,
  type Page,
} from "@playwright/test";

import { createEmptyDocument } from "../../src/shared/domain/document";

interface LaunchResult {
  page: Page;
  storePath: string;
  userDataDirectory: string;
}

type LaunchKopper = (seed?: string) => Promise<LaunchResult>;
type ElectronApplication = Awaited<ReturnType<typeof electron.launch>>;

interface LaunchResource {
  electronApp?: ElectronApplication;
  userDataDirectory: string;
}

const test = base.extend<{ launchKopper: LaunchKopper }>({
  launchKopper: async ({}, use) => {
    const resources: LaunchResource[] = [];

    try {
      await use(async (seed) => {
        const userDataDirectory = await mkdtemp(join(tmpdir(), "kopper-e2e-"));
        const resource: LaunchResource = { userDataDirectory };
        resources.push(resource);
        const storePath = join(userDataDirectory, "kopper.json");

        if (seed !== undefined) {
          await writeFile(storePath, seed, "utf8");
        }

        resource.electronApp = await electron.launch({
          args: [
            join(process.cwd(), "out/main/index.js"),
            `--user-data-dir=${userDataDirectory}`,
          ],
        });

        return {
          page: await resource.electronApp.firstWindow(),
          storePath,
          userDataDirectory,
        };
      });
    } finally {
      const cleanupErrors: unknown[] = [];
      for (const resource of resources.reverse()) {
        try {
          await resource.electronApp?.close();
        } catch (error) {
          cleanupErrors.push(error);
        }

        try {
          await rm(resource.userDataDirectory, {
            recursive: true,
            force: true,
          });
        } catch (error) {
          cleanupErrors.push(error);
        }
      }

      if (cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, "Kopper E2E cleanup failed");
      }
    }
  },
});

test("bundles a sandbox-compatible preload", async () => {
  const preloadPath = join(process.cwd(), "out/preload/index.js");
  const preloadBundle = await readFile(preloadPath, "utf8");
  const runtimeRequires = [
    ...preloadBundle.matchAll(/\brequire\(["']([^"']+)["']\)/g),
  ]
    .map((match) => match[1])
    .filter((dependency): dependency is string => dependency !== undefined);

  expect([...new Set(runtimeRequires)]).toEqual(["electron"]);
});

test("renders a valid seeded store through the secure bridge", async ({
  launchKopper,
}) => {
  const document = createEmptyDocument(
    new Date("2026-08-16T12:00:00.000Z"),
  );
  document.notes.push({
    id: "seeded-note",
    sectionId: document.sections[0].id,
    body: "Seeded startup note",
    order: 0,
    createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z",
    completedAt: null,
    previousPlacement: null,
  });
  const { page } = await launchKopper(`${JSON.stringify(document, null, 2)}\n`);

  await expect(page).toHaveTitle("Kopper");
  if (
    !(await page
      .getByRole("searchbox", { name: "Search notes" })
      .isVisible())
  ) {
    await page
      .getByRole("button", { name: "Continue without capture" })
      .click();
  }
  await expect(page.getByText("Seeded startup note")).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Search notes" }),
  ).toBeVisible();
  await expect(page.evaluate(() => typeof window.process)).resolves.toBe(
    "undefined",
  );
});

test("shows the exact malformed-store error without changing its bytes", async ({
  launchKopper,
}) => {
  const malformed = "{broken startup bytes\n";
  const { page, storePath } = await launchKopper(malformed);

  await expect(page.getByRole("alert")).toHaveText(
    "The Kopper document is not valid JSON.",
  );
  expect(await readFile(storePath)).toEqual(Buffer.from(malformed));
});
