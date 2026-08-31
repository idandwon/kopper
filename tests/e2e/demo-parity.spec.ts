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
import { fillExactly } from "./helpers/formInteractions";

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

async function openThemeActions(page: Page, themeName: string): Promise<void> {
  await page.getByRole("button", { name: `Actions for ${themeName}` }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

async function expectNotesViewportAboveComposer(page: Page): Promise<void> {
  const notesViewport = page
    .locator('[data-scroll-owner="notes"]:visible')
    .locator('[data-slot="scroll-area-viewport"]');
  const composer = page.locator('[data-composer-surface="true"]');
  await expect(notesViewport).toBeVisible();
  await expect(composer).toBeVisible();

  const notesBounds = await notesViewport.boundingBox();
  const composerBounds = await composer.boundingBox();
  expect(notesBounds).not.toBeNull();
  expect(composerBounds).not.toBeNull();
  if (notesBounds === null || composerBounds === null) return;
  expect(notesBounds.y + notesBounds.height).toBeLessThanOrEqual(
    composerBounds.y,
  );
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
    if (width === 340 && height === 480) {
      // Keep the final fixture card fully visible at the owning viewport edge.
      await page
        .getByRole("option", {
          name: "Note: Which edge cases should double-Shift capture handle?",
        })
        .evaluate((note) => note.scrollIntoView({ block: "end" }));
      await expectNotesViewportAboveComposer(page);
    }
    await page.mouse.move(1, Math.floor(height / 2));
    await expect(page).toHaveScreenshot(
      `oxide-ledger-${mode}-${width}x${height}.png`,
      {
        animations: "disabled",
        caret: "hide",
        // macOS 14 CI rasterizes SF Pro glyph edges slightly differently at
        // the minimum surface size; keep larger baselines at the stricter cap.
        maxDiffPixelRatio: width === 340 && height === 480 ? 0.015 : 0.01,
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
        // macOS 14 and 26 rasterize SF Pro glyph edges differently while
        // preserving the same measured layout.
        maxDiffPixelRatio: 0.015,
      },
    );
  }
}

test("matches the keyboard-first prompt, copy, complete, and restore loop", async ({
  kopper,
}) => {
  const page = await kopper.launchKopper();
  await continueWithoutCaptureIfNeeded(page);
  // Keep host keystrokes out while Playwright drives the renderer keyboard.
  await kopper.electronApp.evaluate(({ app }) => app.hide());
  const composer = page.getByRole("textbox", { name: "Add a note or prompt" });

  await composer.fill("How should configuration migrations work?");
  await composer.press("Enter");
  await expect(composer).toHaveValue("");
  await expect(composer).toBeFocused();

  await composer.fill("Should plugins own their configuration schema?");
  await composer.press("Enter");
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
    "1. How should configuration migrations work?\n2. Should plugins own their configuration schema?",
  );

  await second.press("Space");
  await expect(first).toHaveCount(0);
  await expect(second).toHaveCount(0);

  await page.getByRole("tab", { name: "Completed notes" }).click();
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

  await page.getByRole("tab", { name: "Active notes" }).click();
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
  await fillExactly(search, "edge cases");
  const preservedNote = page.getByRole("option", {
    name: "Note: Which edge cases should double-Shift capture handle?",
  });
  await expect(preservedNote).toBeVisible();
  const activeView = page.getByRole("tab", { name: "Active notes" });
  const completedView = page.getByRole("tab", { name: "Completed notes" });
  await expect(activeView).toHaveAttribute("aria-selected", "true");
  await expect(completedView).toHaveAttribute("aria-selected", "false");
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
  await expect(page.getByRole("heading", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.getByRole("tab", { name: "Shortcuts" }).press("ArrowRight");
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();

  const back = page.getByRole("button", { name: "Back to notes" });
  await back.focus();
  await back.press("Enter");
  await expect(search).toHaveValue("edge cases");
  await expect(activeView).toHaveAttribute("aria-selected", "true");
  await expect(completedView).toHaveAttribute("aria-selected", "false");
  await expect(preservedNote).toBeVisible();
  await expect(panelMenu).toBeFocused();
  await expectSurfaceContained(page, "notes");
});

test("keeps control, tab, radius, and overlay geometry on the shared system", async ({
  kopper,
}) => {
  const page = await kopper.launchKopper(demoDocument("light"));
  await continueWithoutCaptureIfNeeded(page);
  await setSurfaceSize(page, 340, 480);

  const notesGeometry = await page.evaluate(() => {
    const search = document.querySelector<HTMLElement>('[data-slot="input"]');
    const pin = document.querySelector<HTMLElement>('[aria-label="Pin panel"]');
    const menu = document.querySelector<HTMLElement>('[aria-label="Panel menu"]');
    const hide = document.querySelector<HTMLElement>('[aria-label="Hide Kopper"]');
    const tab = document.querySelector<HTMLElement>('[role="tab"][aria-label="Active notes"]');
    const card = document.querySelector<HTMLElement>('[data-slot="card"][role="option"]');
    const composer = document.querySelector<HTMLElement>(
      '[data-composer-surface="true"]',
    );
    if (
      [search, pin, menu, hide, tab, card, composer].some(
        (value) => value === null,
      )
    ) {
      return null;
    }
    const tabStyle = getComputedStyle(tab!);
    return {
      heights: [search!, pin!, menu!].map(
        (element) => element.getBoundingClientRect().height,
      ),
      compactHeight: hide!.getBoundingClientRect().height,
      tab: {
        height: tab!.getBoundingClientRect().height,
        paddingLeft: tabStyle.paddingLeft,
        paddingRight: tabStyle.paddingRight,
        fontSize: tabStyle.fontSize,
        fontWeight: tabStyle.fontWeight,
        borderBottomWidth: tabStyle.borderBottomWidth,
      },
      controlRadius: Number.parseFloat(getComputedStyle(search!).borderRadius),
      cardRadius: Number.parseFloat(getComputedStyle(card!).borderRadius),
      composerGap: Number.parseFloat(getComputedStyle(composer!).columnGap),
    };
  });
  expect(notesGeometry).not.toBeNull();
  if (notesGeometry === null) return;
  expect(notesGeometry.heights).toEqual([36, 36, 36]);
  expect(notesGeometry.compactHeight).toBe(32);
  expect(notesGeometry.tab.height).toBe(32);
  expect(notesGeometry.cardRadius).toBeGreaterThan(notesGeometry.controlRadius);
  expect(notesGeometry.composerGap).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Panel menu" }).click();
  const menuLayering = await page.evaluate(() => ({
    menu: getComputedStyle(document.querySelector<HTMLElement>('[role="menu"]')!).zIndex,
    hide: getComputedStyle(document.querySelector<HTMLElement>('[aria-label="Hide Kopper"]')!).zIndex,
  }));
  expect(Number(menuLayering.menu)).toBeGreaterThan(Number(menuLayering.hide));
  await page.getByRole("menuitem", { name: "Settings…" }).click();

  const settingsGeometry = await page.evaluate(() => {
    const back = document.querySelector<HTMLElement>('[aria-label="Back to notes"]');
    const mode = document.querySelector<HTMLElement>('[aria-label="Appearance mode"]');
    const tab = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]')).find(
      (element) => element.textContent === "Appearance",
    );
    if (back === null || mode === null || tab === undefined) return null;
    const tabStyle = getComputedStyle(tab);
    return {
      compactHeight: back.getBoundingClientRect().height,
      controlHeight: mode.getBoundingClientRect().height,
      tab: {
        height: tab.getBoundingClientRect().height,
        paddingLeft: tabStyle.paddingLeft,
        paddingRight: tabStyle.paddingRight,
        fontSize: tabStyle.fontSize,
        fontWeight: tabStyle.fontWeight,
        borderBottomWidth: tabStyle.borderBottomWidth,
      },
    };
  });
  expect(settingsGeometry).toEqual({
    compactHeight: 32,
    controlHeight: 36,
    tab: notesGeometry.tab,
  });

  await openThemeActions(page, "Oxide Ledger");
  await page.getByRole("menuitem", { name: "Customize" }).click();
  const dialog = page.getByRole("dialog", { name: "Customize theme" });
  const dialogGeometry = await dialog.evaluate((element) => {
    const close = Array.from(
      element.querySelectorAll<HTMLElement>("button"),
    ).find(
      (button) => button.querySelector(".sr-only")?.textContent === "Close",
    );
    const input = element.querySelector<HTMLElement>('[data-slot="input"]');
    const shellClose = document.querySelector<HTMLElement>('[aria-label="Hide Kopper"]');
    return {
      closeHeight: close?.getBoundingClientRect().height,
      inputHeight: input?.getBoundingClientRect().height,
      dialogRadius: Number.parseFloat(getComputedStyle(element).borderRadius),
      inputRadius: input === null ? null : Number.parseFloat(getComputedStyle(input).borderRadius),
      dialogZ: Number(getComputedStyle(element).zIndex),
      shellZ: shellClose === null ? null : Number(getComputedStyle(shellClose).zIndex),
    };
  });
  expect(dialogGeometry.closeHeight).toBe(32);
  expect(dialogGeometry.inputHeight).toBe(36);
  expect(dialogGeometry.inputRadius).not.toBeNull();
  expect(dialogGeometry.dialogRadius).toBeGreaterThan(dialogGeometry.inputRadius ?? 0);
  expect(dialogGeometry.dialogZ).toBeGreaterThan(dialogGeometry.shellZ ?? 0);
});

test("centers note state indicators on the first rendered text line", async ({
  kopper,
}) => {
  const page = await kopper.launchKopper(demoDocument("light"));
  await continueWithoutCaptureIfNeeded(page);
  await setSurfaceSize(page, 340, 480);

  const centerOffsets = await page
    .locator("[data-note-owner-id]")
    .evaluateAll((noteOwners) =>
      noteOwners.map((noteOwner) => {
        const stateIcon = noteOwner.querySelector<HTMLElement>(
          '[data-slot="note-state-icon"]',
        );
        const markdown = noteOwner.querySelector<HTMLElement>(
          "[data-note-markdown]",
        );
        if (stateIcon === null || markdown === null) return null;

        const walker = document.createTreeWalker(
          markdown,
          NodeFilter.SHOW_TEXT,
        );
        let textNode = walker.nextNode();
        while (
          textNode !== null &&
          (textNode.textContent ?? "").trim().length === 0
        ) {
          textNode = walker.nextNode();
        }
        if (!(textNode instanceof Text)) return null;

        const firstCharacter = textNode.data.search(/\S/u);
        if (firstCharacter < 0) return null;
        const range = document.createRange();
        range.setStart(textNode, firstCharacter);
        range.setEnd(textNode, firstCharacter + 1);
        const textRect = range.getBoundingClientRect();
        const iconRect = stateIcon.getBoundingClientRect();
        return iconRect.y + iconRect.height / 2 - (textRect.y + textRect.height / 2);
      }),
    );

  expect(centerOffsets).not.toContain(null);
  expect(centerOffsets.length).toBeGreaterThan(0);
  for (const offset of centerOffsets) {
    expect(Math.abs(offset ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(1);
  }
});

test("renders the compact capture onboarding baseline", async ({ kopper }) => {
  const page = await kopper.launchKopper(demoDocument("light"));
  await kopper.electronApp.evaluate(({ systemPreferences }) => {
    Object.defineProperty(systemPreferences, "isTrustedAccessibilityClient", {
      configurable: true,
      value: () => false,
    });
  });
  await page.reload();
  await setSurfaceSize(page, 340, 480);
  await expect(
    page.getByRole("heading", { name: "Enable explicit text capture" }),
  ).toBeVisible();
  await expectSurfaceContained(page, "onboarding");
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
  await page.mouse.move(1, 240);
  await expect(page).toHaveScreenshot("capture-onboarding-light-340x480.png", {
    animations: "disabled",
    caret: "hide",
    // Keep this aligned with the cross-macOS Settings tolerance above.
    maxDiffPixelRatio: 0.015,
  });
});

for (const mode of ["light", "dark"] as const) {
  test(`keeps the compact capture repair panel contained in ${mode} mode`, async ({
    kopper,
  }) => {
    const page = await kopper.launchKopper(demoDocument(mode));
    await kopper.electronApp.evaluate(({ systemPreferences }) => {
      Object.defineProperty(systemPreferences, "isTrustedAccessibilityClient", {
        configurable: true,
        value: () => false,
      });
    });
    await page.reload();
    await setSurfaceSize(page, 340, 480);
    await continueWithoutCaptureIfNeeded(page);

    const access = page.getByLabel("Capture access");
    await expect(access).toBeVisible();
    await kopper.electronApp.evaluate(({ ipcMain }, channel) => {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => ({
        ok: false,
        error: {
          code: "permission_denied",
          message: "Kopper could not reset Accessibility access.",
          retryable: true,
          recoveryAction: "open_settings",
        },
      }));
    }, "kopper:permission:repair");
    await access.getByRole("button", { name: "Repair access" }).click();
    await expect(access.getByText("Capture unavailable", { exact: true })).toBeVisible();
    await expect(
      access.getByText("Kopper could not reset Accessibility access."),
    ).toBeVisible();
    await expect(access.getByRole("button", { name: "Repair access" })).toBeVisible();
    await expect(access.getByRole("button", { name: "Open Settings" })).toBeVisible();
    const geometry = await access.evaluate((alert) => {
      const parent = alert.getBoundingClientRect();
      const children = Array.from(alert.children).map((child) => {
        const rect = child.getBoundingClientRect();
        return {
          slot: child.getAttribute("data-slot"),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      });
      return {
        parent: {
          left: parent.left,
          right: parent.right,
          top: parent.top,
          bottom: parent.bottom,
        },
        children,
      };
    });
    expect(geometry.children.map(({ slot }) => slot)).toEqual([
      "alert-title",
      "alert-description",
    ]);
    for (const child of geometry.children) {
      expect(child.left).toBeGreaterThanOrEqual(geometry.parent.left);
      expect(child.right).toBeLessThanOrEqual(geometry.parent.right);
      expect(child.top).toBeGreaterThanOrEqual(geometry.parent.top);
      expect(child.bottom).toBeLessThanOrEqual(geometry.parent.bottom);
    }
    await expectSurfaceContained(page, "notes");
    await page.mouse.move(1, 240);
    await expect(page).toHaveScreenshot(
      `capture-repair-${mode}-340x480.png`,
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.015,
      },
    );
  });
}

test("renders the compact keyboard shortcuts baseline", async ({ kopper }) => {
  const page = await kopper.launchKopper(demoDocument("light"));
  await continueWithoutCaptureIfNeeded(page);
  await page.getByRole("button", { name: "Panel menu" }).click();
  await page.getByRole("menuitem", { name: "Settings…" }).click();
  await page.getByRole("tab", { name: "Shortcuts" }).click();
  await expect(
    page.getByRole("heading", { name: "Keyboard shortcuts" }),
  ).toBeVisible();

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
      `keyboard-shortcuts-light-${width}x${height}.png`,
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.01,
      },
    );
  }
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
