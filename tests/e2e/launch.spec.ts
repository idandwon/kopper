import {
  access,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createEmptyDocument } from "../../src/shared/domain/document";
import {
  continueWithoutCaptureIfNeeded,
  expect,
  fixturePath,
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

test("rejects dialog symlink escapes while allowing canonical fixture paths", async ({
  kopper,
}) => {
  const outsideDirectory = await mkdtemp(join(tmpdir(), "kopper-dialog-outside-"));
  const outsideOpenPath = join(outsideDirectory, "outside.json");
  const outsideSavePath = join(outsideDirectory, "must-not-be-written.json");
  const escapeLink = fixturePath(kopper, "escape");

  try {
    await writeFile(outsideOpenPath, "outside sentinel", "utf8");
    await symlink(outsideDirectory, escapeLink, "dir");
    const page = await kopper.launchKopper();
    await continueWithoutCaptureIfNeeded(page);

    await expect(
      kopper.stubNextOpenDialog(join(escapeLink, "outside.json")),
    ).rejects.toThrow(
      "Dialog paths must stay inside the isolated user-data directory.",
    );
    await expect(
      kopper.stubNextSaveDialog(join(escapeLink, "must-not-be-written.json")),
    ).rejects.toThrow(
      "Dialog paths must stay inside the isolated user-data directory.",
    );
    expect(await readFile(outsideOpenPath, "utf8")).toBe("outside sentinel");
    await expect(access(outsideSavePath)).rejects.toThrow();

    const normalOpenPath = fixturePath(kopper, "inside.json");
    const normalSavePath = fixturePath(kopper, "inside-export.json");
    await writeFile(normalOpenPath, "inside sentinel", "utf8");
    await expect(kopper.stubNextOpenDialog(normalOpenPath)).resolves.toBeUndefined();
    await expect(kopper.stubNextSaveDialog(normalSavePath)).resolves.toBeUndefined();
    await kopper.closeKopper();
  } finally {
    await rm(outsideDirectory, { recursive: true });
  }
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
