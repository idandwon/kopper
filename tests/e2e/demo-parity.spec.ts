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

async function expectPanelFitsViewport(
  page: Page,
  width: number,
  height: number,
): Promise<void> {
  await page.setViewportSize({ width, height });
  const layout = await page.evaluate(() => {
    const panel = document.querySelector("main");
    const composer = document.querySelector("[data-composer-surface]");
    const panelBounds = panel?.getBoundingClientRect();
    const composerBounds = composer?.getBoundingClientRect();
    return {
      innerWidth,
      innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      panelRight: panelBounds?.right ?? Number.POSITIVE_INFINITY,
      panelBottom: panelBounds?.bottom ?? Number.POSITIVE_INFINITY,
      composerRight: composerBounds?.right ?? Number.POSITIVE_INFINITY,
      composerBottom: composerBounds?.bottom ?? Number.POSITIVE_INFINITY,
    };
  });

  expect(layout).toMatchObject({
    innerWidth: width,
    innerHeight: height,
    scrollWidth: width,
    panelRight: width,
    panelBottom: height,
  });
  expect(width - layout.composerRight).toBeGreaterThanOrEqual(15);
  expect(width - layout.composerRight).toBeLessThanOrEqual(18);
  expect(height - layout.composerBottom).toBeGreaterThanOrEqual(15);
  expect(height - layout.composerBottom).toBeLessThanOrEqual(18);
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

  await expectPanelFitsViewport(page, 380, 640);
  await expect(page).toHaveScreenshot(`oxide-ledger-${mode}-380x640.png`, {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
  });

  await expectPanelFitsViewport(page, 340, 480);
  await expect(page).toHaveScreenshot(`oxide-ledger-${mode}-340x480.png`, {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
  });
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

test("renders deterministic Oxide Ledger light baselines", async ({ kopper }) => {
  const page = await kopper.launchKopper(demoDocument("light"));
  await continueWithoutCaptureIfNeeded(page);
  await expectVisualBaselines(page, "light");
});

test("renders deterministic Oxide Ledger dark baselines", async ({ kopper }) => {
  const page = await kopper.launchKopper(demoDocument("dark"));
  await continueWithoutCaptureIfNeeded(page);
  await expectVisualBaselines(page, "dark");
});
