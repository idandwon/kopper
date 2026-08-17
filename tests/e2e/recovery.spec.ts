import { readFile, writeFile } from "node:fs/promises";

import type { Page } from "@playwright/test";

import { createEmptyDocument } from "../../src/shared/domain/document";
import {
  continueWithoutCaptureIfNeeded,
  expect,
  fixturePath,
  test,
} from "./fixtures/electronApp";
import {
  expectOverlayContained,
  expectSurfaceContained,
  setSurfaceSize,
} from "./helpers/surfaceGeometry";

function documentWithNote(body: string) {
  const document = createEmptyDocument(new Date("2026-08-16T12:00:00.000Z"));
  document.notes.push({
    id: `${body.toLowerCase().replaceAll(" ", "-")}-id`,
    sectionId: document.sections[0].id,
    body,
    order: 0,
    createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z",
    completedAt: null,
    previousPlacement: null,
  });
  return document;
}

async function openDataSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Panel menu" }).click();
  await page.getByRole("menuitem", { name: "Settings…" }).click();
  await page.getByRole("tab", { name: "Data" }).click();
  await expect(page.getByRole("heading", { name: "Data files" })).toBeVisible();
}

test("preserves malformed bytes and requires UI confirmation for every recovery decision", async ({
  kopper,
}) => {
  const malformed = Buffer.from([0x7b, 0x62, 0x72, 0x6f, 0x6b, 0x65, 0x6e, 0xff, 0x0a]);
  const page = await kopper.launchKopper(malformed);
  await setSurfaceSize(page, 340, 480);
  await expectSurfaceContained(page, "recovery");
  await expect(page.getByRole("alert")).toHaveText(
    "The Kopper document is not valid JSON.",
  );

  const exportedBytes = fixturePath(kopper, "damaged-export.bin");
  await kopper.stubNextSaveDialog(exportedBytes);
  await page.getByRole("button", { name: "Export damaged content" }).click();
  await expect(page.getByRole("status")).toContainText("Exported damaged-export.bin unchanged.");

  await page.getByRole("button", { name: "Create new store" }).click();
  const createDialog = page.getByRole("alertdialog", {
    name: "Create a new empty store?",
  });
  await expectOverlayContained(page, createDialog);
  await createDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  await kopper.closeKopper();
  expect(await kopper.readPersistedBytes()).toEqual(malformed);
  expect(await readFile(exportedBytes)).toEqual(malformed);

  const recovered = documentWithNote("Recovered source note");
  const replacement = documentWithNote("Cancelled replacement note");
  const recoveredPath = fixturePath(kopper, "recovered.json");
  const replacementPath = fixturePath(kopper, "replacement.json");
  await writeFile(recoveredPath, `${JSON.stringify(recovered, null, 2)}\n`);
  await writeFile(replacementPath, `${JSON.stringify(replacement, null, 2)}\n`);

  const relaunched = await kopper.relaunchKopper();
  await setSurfaceSize(relaunched, 340, 480);
  await expectSurfaceContained(relaunched, "recovery");
  await expect(relaunched.getByRole("alert")).toBeVisible();
  await relaunched.getByRole("button", { name: "Create new store" }).click();
  const confirmCreate = relaunched.getByRole("alertdialog", {
    name: "Create a new empty store?",
  });
  await expectOverlayContained(relaunched, confirmCreate);
  await confirmCreate
    .getByRole("button", { name: "Confirm create new store" })
    .click();
  await continueWithoutCaptureIfNeeded(relaunched);
  await expectSurfaceContained(relaunched, "notes");

  await openDataSettings(relaunched);
  await expectSurfaceContained(relaunched, "settings");
  await kopper.stubNextOpenDialog(recoveredPath);
  await relaunched.getByRole("button", { name: "Import data" }).click();
  const importDialog = relaunched.getByRole("alertdialog", {
    name: "Replace current data?",
  });
  await expectOverlayContained(relaunched, importDialog);
  await expect(importDialog).toContainText("1 notes and 1 sections");
  await importDialog.getByRole("button", { name: "Replace current data" }).click();
  await expect(relaunched.getByRole("status")).toContainText("Import complete.");

  await kopper.stubNextOpenDialog(replacementPath);
  await relaunched.getByRole("button", { name: "Import data" }).click();
  const cancelledImport = relaunched.getByRole("alertdialog", {
    name: "Replace current data?",
  });
  await expectOverlayContained(relaunched, cancelledImport);
  await expect(cancelledImport).toContainText("replacement.json");
  await cancelledImport.getByRole("button", { name: "Cancel" }).click();
  await expect(cancelledImport).toHaveCount(0);

  await kopper.closeKopper();
  const persisted = await kopper.readPersistedDocument();
  expect(persisted.notes.map(({ body }) => body)).toEqual([
    "Recovered source note",
  ]);
});
