import { access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { createEmptyDocument } from "../../src/shared/domain/document";
import {
  continueWithoutCaptureIfNeeded,
  expect,
  test,
} from "./fixtures/electronApp";

let firstDirectory = "";
let secondDirectory = "";

test.describe.serial("isolated Electron fixture", () => {
  test("writes a valid initial document before the first isolated launch", async ({
    kopper,
  }) => {
    firstDirectory = kopper.userDataDirectory;
    expect(firstDirectory.startsWith(tmpdir())).toBe(true);

    const initial = createEmptyDocument(new Date("2026-08-16T12:00:00.000Z"));
    initial.notes.push({
      id: "initial-note",
      sectionId: initial.sections[0].id,
      body: "Initial fixture note",
      order: 0,
      createdAt: "2026-08-16T12:00:00.000Z",
      updatedAt: "2026-08-16T12:00:00.000Z",
      completedAt: null,
      previousPlacement: null,
    });

    const page = await kopper.launchKopper(initial);
    await continueWithoutCaptureIfNeeded(page);
    await expect(page.getByText("Initial fixture note")).toBeVisible();
    await kopper.closeKopper();
    expect((await kopper.readPersistedDocument()).notes[0]?.body).toBe(
      "Initial fixture note",
    );
  });

  test("uses a different directory and removes the previous fixture", async ({
    kopper,
  }) => {
    secondDirectory = kopper.userDataDirectory;
    expect(secondDirectory).not.toBe(firstDirectory);
    await expect(access(firstDirectory)).rejects.toThrow();
    const page = await kopper.launchKopper();
    await continueWithoutCaptureIfNeeded(page);
    await kopper.closeKopper();
  });
});

test.afterAll(async () => {
  if (secondDirectory !== "") await expect(access(secondDirectory)).rejects.toThrow();
});

test("bundles a sandbox-compatible preload", async () => {
  const preloadPath = `${process.cwd()}/out/preload/index.js`;
  const preloadBundle = await readFile(preloadPath, "utf8");
  const runtimeRequires = [
    ...preloadBundle.matchAll(/\brequire\(["']([^"']+)["']\)/g),
  ]
    .map((match) => match[1])
    .filter((dependency): dependency is string => dependency !== undefined);

  expect([...new Set(runtimeRequires)]).toEqual(["electron"]);
});
