import type { Page } from "@playwright/test";

import {
  createEmptyDocument,
  type AppearanceMode,
  type KopperDocument,
} from "../../src/shared/domain/document";
import {
  continueWithoutCaptureIfNeeded,
  expect,
  test,
} from "./fixtures/electronApp";
import {
  expectSurfaceContained,
  setSurfaceSize,
} from "./helpers/surfaceGeometry";

const TIMESTAMP = "2026-08-16T12:00:00.000Z";

function demoDocument(mode: AppearanceMode): KopperDocument {
  const document = createEmptyDocument(new Date(TIMESTAMP));
  const inbox = document.sections[0];
  if (inbox === undefined) throw new Error("Demo document requires Inbox.");
  const prompts = {
    id: "demo-prompts",
    title: "Next prompts",
    order: 1,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  return {
    ...document,
    sections: [{ ...inbox, id: "demo-inbox", title: "Workbench" }, prompts],
    notes: [
      {
        id: "demo-note-1",
        sectionId: "demo-inbox",
        body: "**Refine the capture flow.** Keep focus in the source app and restore the clipboard.",
        order: 0,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
        completedAt: null,
        previousPlacement: null,
      },
      {
        id: "demo-note-2",
        sectionId: "demo-inbox",
        body: "The local ledger stays readable Markdown with explicit export.",
        order: 1,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
        completedAt: null,
        previousPlacement: null,
      },
      {
        id: "demo-note-3",
        sectionId: "demo-prompts",
        body: "Which edge cases should double-Shift capture handle?",
        order: 0,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
        completedAt: null,
        previousPlacement: null,
      },
    ],
    activeSectionId: "demo-prompts",
    appearance: {
      mode,
      activeThemeId: "builtin:oxide-ledger",
    },
    window: {
      pinned: false,
      bounds: { x: 80, y: 80, width: 380, height: 640 },
    },
  };
}

async function openAppearanceSettings(page: Page): Promise<void> {
  const trigger = page.getByRole("button", { name: "Panel menu" });
  await trigger.focus();
  await trigger.press("Enter");
  const item = page.getByRole("menuitem", { name: "Settings…" });
  await item.focus();
  await item.press("Enter");
  await expect(page.getByRole("tab", { name: "Appearance" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
}

async function expectVisualBaselines(
  page: Page,
  mode: "light" | "dark",
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue("color-scheme"),
      ),
    )
    .toBe(mode);

  for (const [width, height] of [
    [380, 640],
    [340, 480],
  ] as const) {
    await setSurfaceSize(page, width, height);
    await expectSurfaceContained(page, "notes");
    await page.mouse.move(1, Math.floor(height / 2));
    await expect(page).toHaveScreenshot(
      `oxide-ledger-${mode}-${width}x${height}.png`,
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.01,
      },
    );
  }

  await openAppearanceSettings(page);
  for (const [width, height] of [
    [380, 640],
    [340, 480],
  ] as const) {
    await setSurfaceSize(page, width, height);
    await expectSurfaceContained(page, "settings");
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });
    await page.mouse.move(1, Math.floor(height / 2));
    await expect(page).toHaveScreenshot(
      `oxide-ledger-settings-${mode}-${width}x${height}.png`,
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.01,
      },
    );
  }
}

test("matches the keyboard-first prompt, copy, complete, and restore loop", async ({
  kopper,
}) => {
  const page = await kopper.launchKopper();
  await continueWithoutCaptureIfNeeded(page);
  const composer = page.getByRole("textbox", { name: "Add a note or prompt" });

  await composer.fill("How should configuration migrations work?");
  await composer.press("Meta+Enter");
  await expect(composer).toHaveValue("");
  await expect(composer).toBeFocused();

  await composer.fill("Should plugins own their configuration schema?");
  await composer.press("Meta+Enter");
  await expect(composer).toHaveValue("");
  await expect(composer).toBeFocused();

  const first = page.getByRole("option", {
    name: "Note: How should configuration migrations work?",
  });
  const second = page.getByRole("option", {
    name: "Note: Should plugins own their configuration schema?",
  });
  await first.click();
  await second.click({ modifiers: ["Meta"] });
  await expect(page.getByText("2 selected · ⌘C copy · Space done")).toBeVisible();

  await second.press("Shift+Meta+C");
  await expect.poll(() => kopper.readClipboardText()).toBe(
    "- How should configuration migrations work?\n- Should plugins own their configuration schema?",
  );

  await second.press("Space");
  await expect(first).toHaveCount(0);
  await expect(second).toHaveCount(0);

  await page.getByRole("button", { name: "Completed notes" }).click();
  const completedFirst = page.getByRole("option", {
    name: "Note: How should configuration migrations work?",
  });
  const completedSecond = page.getByRole("option", {
    name: "Note: Should plugins own their configuration schema?",
  });
  await completedFirst.click();
  await completedSecond.click({ modifiers: ["Meta"] });
  await completedSecond.press("Space");
  await expect(completedFirst).toHaveCount(0);
  await expect(completedSecond).toHaveCount(0);

  await page.getByRole("button", { name: "Active notes" }).click();
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
});

test("preserves notes state through the full keyboard Settings traversal", async ({
  kopper,
}) => {
  const page = await kopper.launchKopper(demoDocument("light"));
  await continueWithoutCaptureIfNeeded(page);
  await setSurfaceSize(page, 340, 480);

  const search = page.getByRole("searchbox", { name: "Search notes" });
  await search.fill("edge cases");
  const preservedNote = page.getByRole("option", {
    name: "Note: Which edge cases should double-Shift capture handle?",
  });
  await expect(preservedNote).toBeVisible();
  await expectSurfaceContained(page, "notes");

  const panelMenu = page.getByRole("button", { name: "Panel menu" });
  await panelMenu.focus();
  await panelMenu.press("Enter");
  const settingsItem = page.getByRole("menuitem", { name: "Settings…" });
  await settingsItem.focus();
  await settingsItem.press("Enter");

  const appearanceTab = page.getByRole("tab", { name: "Appearance" });
  await expect(appearanceTab).toHaveAttribute("aria-selected", "true");
  await expectSurfaceContained(page, "settings");
  await appearanceTab.focus();
  await appearanceTab.press("ArrowRight");
  await expect(page.getByRole("heading", { name: "Data files" })).toBeVisible();
  await page.getByRole("tab", { name: "Data" }).press("ArrowRight");
  await expect(page.getByRole("heading", { name: "Shortcuts & panel" })).toBeVisible();
  await page.getByRole("tab", { name: "Shortcuts" }).press("ArrowRight");
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();

  const back = page.getByRole("button", { name: "Back to notes" });
  await back.focus();
  await back.press("Enter");
  await expect(search).toHaveValue("edge cases");
  await expect(page.getByRole("button", { name: "Completed notes" })).toBeVisible();
  await expect(preservedNote).toBeVisible();
  await expect(panelMenu).toBeFocused();
  await expectSurfaceContained(page, "notes");
});

test("renders deterministic Oxide Ledger Light Settings baselines", async ({
  kopper,
}) => {
  const page = await kopper.launchKopper(demoDocument("light"));
  await continueWithoutCaptureIfNeeded(page);
  await expectVisualBaselines(page, "light");
});

test("renders deterministic Oxide Ledger Dark Settings baselines", async ({
  kopper,
}) => {
  const page = await kopper.launchKopper(demoDocument("dark"));
  await continueWithoutCaptureIfNeeded(page);
  await expectVisualBaselines(page, "dark");
});
