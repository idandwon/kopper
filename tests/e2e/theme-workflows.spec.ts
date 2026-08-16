import { readFile } from "node:fs/promises";

import type { Page } from "@playwright/test";

import {
  continueWithoutCaptureIfNeeded,
  expect,
  fixturePath,
  test,
} from "./fixtures/electronApp";

async function openAppearance(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Panel menu" }).click();
  await page.getByRole("menuitem", { name: "Settings…" }).click();
  await page.getByRole("tab", { name: "Appearance" }).click();
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
}

async function chooseAppearanceMode(page: Page, name: "System" | "Light" | "Dark"): Promise<void> {
  await page.getByRole("combobox", { name: "Appearance mode" }).click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(
    page.getByRole("status").filter({
      hasText: `Selected ${name.toLowerCase()} appearance`,
    }),
  ).toBeAttached();
}

test("persists modes, presets, edited custom theme, and imported preview decisions", async ({
  kopper,
}) => {
  const page = await kopper.launchKopper();
  await continueWithoutCaptureIfNeeded(page);
  await openAppearance(page);

  await chooseAppearanceMode(page, "Light");
  await chooseAppearanceMode(page, "Dark");
  await chooseAppearanceMode(page, "System");

  for (const preset of ["Night Workshop", "Index Drawer", "Oxide Ledger"]) {
    await page.getByRole("button", { name: `Activate ${preset}` }).click();
    await expect(page.getByRole("button", { name: `Active ${preset}` })).toBeVisible();
  }

  await page.getByRole("button", { name: "Customize Oxide Ledger" }).click();
  const createDialog = page.getByRole("dialog", { name: "Customize theme" });
  const foreground = createDialog.getByLabel("foreground", { exact: true });
  await foreground.fill("#F6F9F6");
  await expect(createDialog.getByRole("button", { name: "Save theme" })).toBeDisabled();
  await expect(createDialog.getByRole("alert").first()).toContainText("Contrast");
  await foreground.fill("#173D35");
  await expect(createDialog.getByText("Theme is readable in both modes.")).toBeVisible();
  await createDialog.getByRole("button", { name: "Save theme" }).click();

  await expect(page.getByRole("button", { name: "Active Oxide Ledger Custom" })).toBeVisible();
  await page.getByRole("button", { name: "Edit Oxide Ledger Custom" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit custom theme" });
  await editDialog.getByLabel("capture", { exact: true }).fill("#A05030");
  await editDialog.getByLabel("radius", { exact: true }).fill("1rem");
  await expect(editDialog.getByText("Theme is readable in both modes.")).toBeVisible();
  const saveEditedTheme = editDialog.getByRole("button", { name: "Save theme" });
  await saveEditedTheme.focus();
  await saveEditedTheme.press("Enter");

  const exportedTheme = fixturePath(kopper, "edited-theme.kopper-theme.json");
  await kopper.stubNextSaveDialog(exportedTheme);
  await page.getByRole("button", { name: "Export Oxide Ledger Custom" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Theme exported." })).toBeVisible();
  const exported = JSON.parse(await readFile(exportedTheme, "utf8")) as {
    light: { capture: string; radius: string };
  };
  expect(exported.light.capture).toBe("#A05030");
  expect(exported.light.radius).toBe("1rem");

  await page.getByRole("button", { name: "Activate Oxide Ledger", exact: true }).click();
  await expect(page.getByRole("button", { name: "Active Oxide Ledger", exact: true })).toBeVisible();

  await kopper.stubNextOpenDialog(exportedTheme);
  await page.getByRole("button", { name: "Import theme" }).click();
  const importDialog = page.getByRole("dialog", { name: "Oxide Ledger Custom" });
  await expect(importDialog.getByText("Validated preview only.")).toBeVisible();
  await importDialog.getByRole("button", { name: "Preview" }).click();
  await importDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Active Oxide Ledger", exact: true })).toBeVisible();

  await kopper.stubNextOpenDialog(exportedTheme);
  await page.getByRole("button", { name: "Import theme" }).click();
  const secondImport = page.getByRole("dialog", { name: "Oxide Ledger Custom" });
  await secondImport.getByRole("button", { name: "Preview" }).click();
  await secondImport.getByRole("button", { name: "Save imported theme" }).click();
  await expect(page.getByText("Oxide Ledger Custom saved and activated.")).toBeVisible();

  await kopper.closeKopper();
  const persisted = await kopper.readPersistedDocument();
  const active = persisted.customThemes.find(
    ({ id }) => id === persisted.appearance.activeThemeId,
  );
  expect(active?.name).toBe("Oxide Ledger Custom");
  expect(active?.light.capture).toBe("#A05030");
  expect(active?.light.radius).toBe("1rem");

  const relaunched = await kopper.relaunchKopper();
  await continueWithoutCaptureIfNeeded(relaunched);
  await openAppearance(relaunched);
  await expect(
    relaunched.getByRole("button", { name: "Active Oxide Ledger Custom" }),
  ).toBeVisible();
  await kopper.closeKopper();
});
