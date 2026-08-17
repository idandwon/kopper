import { readFile } from "node:fs/promises";

import type { Page } from "@playwright/test";

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

const CANONICAL_ROOT_THEME_PROPERTIES = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--border",
  "--input",
  "--ring",
  "--radius",
  "--capture",
  "--organized",
  "--completed",
] as const;

interface RootThemeSnapshot {
  className: string;
  dark: boolean;
  colorScheme: { value: string; priority: string };
  properties: Record<string, { value: string; priority: string }>;
}

async function readRootThemeSnapshot(page: Page): Promise<RootThemeSnapshot> {
  return page.evaluate((properties) => {
    const root = document.documentElement;
    return {
      className: root.className,
      dark: root.classList.contains("dark"),
      colorScheme: {
        value: root.style.getPropertyValue("color-scheme"),
        priority: root.style.getPropertyPriority("color-scheme"),
      },
      properties: Object.fromEntries(
        properties.map((property) => [
          property,
          {
            value: root.style.getPropertyValue(property),
            priority: root.style.getPropertyPriority(property),
          },
        ]),
      ),
    };
  }, CANONICAL_ROOT_THEME_PROPERTIES);
}

async function expectExportedLightPreview(
  page: Page,
  exported: { light: { primary: string; radius: string } },
): Promise<RootThemeSnapshot> {
  await expect
    .poll(async () => {
      const snapshot = await readRootThemeSnapshot(page);
      return {
        primary: snapshot.properties["--primary"]?.value,
        radius: snapshot.properties["--radius"]?.value,
        dark: snapshot.dark,
        colorScheme: snapshot.colorScheme.value,
      };
    })
    .toEqual({
      primary: exported.light.primary,
      radius: exported.light.radius,
      dark: false,
      colorScheme: "light",
    });
  return readRootThemeSnapshot(page);
}

async function openAppearance(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Panel menu" }).click();
  await page.getByRole("menuitem", { name: "Settings…" }).click();
  await page.getByRole("tab", { name: "Appearance" }).click();
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
}

async function chooseAppearanceMode(page: Page, name: "System" | "Light" | "Dark"): Promise<void> {
  await page.getByRole("combobox", { name: "Appearance mode" }).click();
  await expectOverlayContained(page, page.getByRole("listbox"));
  await page.getByRole("option", { name, exact: true }).click();
  await expect(
    page.getByRole("status").filter({
      hasText: `Selected ${name.toLowerCase()} appearance`,
    }),
  ).toBeAttached();
}

async function openThemeActions(page: Page, themeName: string): Promise<void> {
  await page.getByRole("button", { name: `Actions for ${themeName}` }).click();
  await expectOverlayContained(page, page.getByRole("menu"));
}

test("persists modes, presets, edited custom theme, and imported preview decisions", async ({
  kopper,
}) => {
  const page = await kopper.launchKopper();
  await continueWithoutCaptureIfNeeded(page);
  await setSurfaceSize(page, 340, 480);
  await openAppearance(page);
  await expectSurfaceContained(page, "settings");

  await chooseAppearanceMode(page, "Light");
  await chooseAppearanceMode(page, "Dark");
  await chooseAppearanceMode(page, "System");

  for (const preset of ["Night Workshop", "Index Drawer", "Oxide Ledger"]) {
    await page.getByRole("button", { name: `Activate ${preset}` }).click();
    await expect(page.getByRole("button", { name: `Active ${preset}` })).toBeVisible();
  }

  await openThemeActions(page, "Oxide Ledger");
  await page.getByRole("menuitem", { name: "Customize" }).click();
  const createDialog = page.getByRole("dialog", { name: "Customize theme" });
  await expectOverlayContained(page, createDialog);
  await expect(
    createDialog.locator('[data-scroll-owner="theme-editor"]'),
  ).toBeVisible();
  const foreground = createDialog.getByLabel("foreground", { exact: true });
  await foreground.fill("#F6F9F6");
  await expect(createDialog.getByRole("button", { name: "Save theme" })).toBeDisabled();
  await expect(createDialog.getByRole("alert").first()).toContainText("Contrast");
  await foreground.fill("#173D35");
  await expect(createDialog.getByText("Theme is readable in both modes.")).toBeVisible();
  await createDialog.getByRole("button", { name: "Save theme" }).click();

  await expect(page.getByRole("button", { name: "Active Oxide Ledger Custom" })).toBeVisible();
  await openThemeActions(page, "Oxide Ledger Custom");
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("alertdialog", {
    name: "Delete custom theme?",
  });
  await expectOverlayContained(page, deleteDialog);
  await deleteDialog.getByRole("button", { name: "Cancel" }).click();

  await openThemeActions(page, "Oxide Ledger Custom");
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit custom theme" });
  await expectOverlayContained(page, editDialog);
  await expect(
    editDialog.locator('[data-scroll-owner="theme-editor"]'),
  ).toBeVisible();
  await editDialog.getByLabel("primary", { exact: true }).fill("#285F54");
  await editDialog.getByLabel("capture", { exact: true }).fill("#A05030");
  await editDialog.getByLabel("radius", { exact: true }).fill("1rem");
  await expect(editDialog.getByText("Theme is readable in both modes.")).toBeVisible();
  const saveEditedTheme = editDialog.getByRole("button", { name: "Save theme" });
  await saveEditedTheme.focus();
  await saveEditedTheme.press("Enter");

  const exportedTheme = fixturePath(kopper, "edited-theme.kopper-theme.json");
  await kopper.stubNextSaveDialog(exportedTheme);
  await openThemeActions(page, "Oxide Ledger Custom");
  await page.getByRole("menuitem", { name: "Export" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Theme exported." })).toBeVisible();
  const exported = JSON.parse(await readFile(exportedTheme, "utf8")) as {
    light: { capture: string; primary: string; radius: string };
  };
  expect(exported.light.capture).toBe("#A05030");
  expect(exported.light.primary).toBe("#285F54");
  expect(exported.light.radius).toBe("1rem");

  await chooseAppearanceMode(page, "Light");
  await page.getByRole("button", { name: "Activate Oxide Ledger", exact: true }).click();
  await expect(page.getByRole("button", { name: "Active Oxide Ledger", exact: true })).toBeVisible();

  await kopper.stubNextOpenDialog(exportedTheme);
  await page.getByRole("button", { name: "Import theme" }).click();
  const importDialog = page.getByRole("dialog", { name: "Oxide Ledger Custom" });
  await expectOverlayContained(page, importDialog);
  await expect(importDialog.getByText("Validated preview only.")).toBeVisible();
  const beforeCancelledPreview = await readRootThemeSnapshot(page);
  await importDialog.getByRole("button", { name: "Preview" }).click();
  const cancelledPreview = await expectExportedLightPreview(page, exported);
  expect(cancelledPreview).not.toEqual(beforeCancelledPreview);
  await importDialog.getByRole("button", { name: "Cancel" }).click();
  await expect
    .poll(() => readRootThemeSnapshot(page))
    .toEqual(beforeCancelledPreview);
  await expect(page.getByRole("button", { name: "Active Oxide Ledger", exact: true })).toBeVisible();

  await kopper.stubNextOpenDialog(exportedTheme);
  await page.getByRole("button", { name: "Import theme" }).click();
  const secondImport = page.getByRole("dialog", { name: "Oxide Ledger Custom" });
  await expectOverlayContained(page, secondImport);
  const beforeSavedPreview = await readRootThemeSnapshot(page);
  await secondImport.getByRole("button", { name: "Preview" }).click();
  const savedPreview = await expectExportedLightPreview(page, exported);
  expect(savedPreview).not.toEqual(beforeSavedPreview);
  await secondImport.getByRole("button", { name: "Save imported theme" }).click();
  await expect(page.getByText("Oxide Ledger Custom saved and activated.")).toBeVisible();
  await expect.poll(() => readRootThemeSnapshot(page)).toEqual(savedPreview);
  await expectSurfaceContained(page, "settings");

  await kopper.closeKopper();
  const persisted = await kopper.readPersistedDocument();
  const active = persisted.customThemes.find(
    ({ id }) => id === persisted.appearance.activeThemeId,
  );
  expect(active?.name).toBe("Oxide Ledger Custom");
  expect(active?.light.capture).toBe("#A05030");
  expect(active?.light.primary).toBe("#285F54");
  expect(active?.light.radius).toBe("1rem");

  const relaunched = await kopper.relaunchKopper();
  await continueWithoutCaptureIfNeeded(relaunched);
  await openAppearance(relaunched);
  await expect(
    relaunched.getByRole("button", { name: "Active Oxide Ledger Custom" }),
  ).toBeVisible();
  await kopper.closeKopper();
});
