import type { Page } from "@playwright/test";

import {
  continueWithoutCaptureIfNeeded,
  expect,
  test,
} from "./fixtures/electronApp";
import {
  expectOverlayContained,
  expectSurfaceContained,
  setSurfaceSize,
} from "./helpers/surfaceGeometry";

async function choosePanelMenuAction(
  page: Page,
  actionName: string,
): Promise<void> {
  const trigger = page.getByRole("button", { name: "Panel menu" });
  await trigger.focus();
  await trigger.press("Enter");
  await expectOverlayContained(page, page.getByRole("menu"));
  const item = page.getByRole("menuitem", { name: actionName });
  await expect(item).toBeEnabled();
  await item.focus();
  await item.press("Enter");
}

async function addSection(page: Page, name: string): Promise<void> {
  await choosePanelMenuAction(page, "Add section");
  const dialog = page.getByRole("dialog", { name: "Add section" });
  await expectOverlayContained(page, dialog);
  await dialog.getByLabel("Section name").fill(name);
  await dialog.getByRole("button", { name: "Create section" }).click();
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
}

async function addNote(page: Page, body: string): Promise<void> {
  await page.getByLabel("Add a note or prompt").fill(body);
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("option", { name: `Note: ${body}` })).toBeVisible();
}

async function openNoteMenu(page: Page, body: string): Promise<void> {
  await page.getByRole("option", { name: `Note: ${body}` }).click({
    button: "right",
  });
  const menu = page.getByRole("menu", { name: "Note actions" });
  await expectOverlayContained(page, menu);
}

test("isolates a complete document journey and persists only acknowledged state", async ({
  kopper,
}) => {
  const page = await kopper.launchKopper();
  await continueWithoutCaptureIfNeeded(page);
  await setSurfaceSize(page, 340, 480);
  await expectSurfaceContained(page, "notes");

  await addSection(page, "Research");
  await addSection(page, "Archive");
  await addNote(page, "Alpha finding");
  await addNote(page, "Beta decision");

  await openNoteMenu(page, "Alpha finding");
  const editorWindow = kopper.electronApp.waitForEvent("window");
  await page.getByRole("menuitem", { name: "Edit in new window" }).click();
  const editor = await editorWindow;
  await setSurfaceSize(editor, 420, 480);
  await expect(editor.getByRole("heading", { name: "Edit note" })).toBeVisible();
  await expect(editor.getByRole("textbox", { name: "Edit note" })).toBeInViewport();
  await expectSurfaceContained(editor, "editor");
  await editor.close();

  await page.getByRole("button", { name: "Research", exact: true }).click();
  await addNote(page, "Gamma reference");

  await page.getByRole("button", { name: "Manage Research" }).click();
  await expectOverlayContained(page, page.getByRole("menu"));
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const renameDialog = page.getByRole("dialog", { name: "Rename section" });
  await expectOverlayContained(page, renameDialog);
  await renameDialog.getByLabel("Section name").fill("Projects");
  await renameDialog.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("button", { name: "Projects", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Manage Archive" }).click();
  await expectOverlayContained(page, page.getByRole("menu"));
  await page.getByRole("menuitem", { name: "Move up" }).click();
  const headings = page.getByRole("heading", { level: 2 });
  await expect(headings).toHaveText(["Inbox", "Archive", "Projects"]);

  const search = page.getByRole("searchbox", { name: "Search notes" });
  await search.fill("Gamma");
  await expect(page.getByRole("option", { name: "Note: Gamma reference" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Note: Alpha finding" })).toHaveCount(0);
  await search.fill("");

  const alpha = page.getByRole("option", { name: "Note: Alpha finding" });
  const beta = page.getByRole("option", { name: "Note: Beta decision" });
  await alpha.click();
  await beta.click({ modifiers: ["Meta"] });
  await beta.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy as list" }).click();
  await expect.poll(() => kopper.readClipboardText()).toBe(
    "- Alpha finding\n- Beta decision",
  );

  await beta.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Merge notes" }).click();
  const merged = page.getByRole("option", {
    name: "Note: Alpha finding\n\nBeta decision",
  });
  await expect(merged).toBeVisible();
  await choosePanelMenuAction(page, "Undo");
  await expect(beta).toBeVisible();

  await alpha.click();
  await beta.click({ modifiers: ["Meta"] });
  await beta.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Merge notes" }).click();
  await expect(merged).toBeVisible();

  await page.getByRole("button", { name: /Mark Alpha finding.*Beta decision as done/ }).click();
  await expect(merged).toHaveCount(0);
  await page.getByRole("button", { name: "Completed notes" }).click();
  await expect(merged).toBeVisible();
  await page.getByRole("button", { name: /Restore Alpha finding.*Beta decision/ }).click();
  await expect(merged).toHaveCount(0);
  await page.getByRole("button", { name: "Active notes" }).click();
  await expect(merged).toBeVisible();

  await openNoteMenu(page, "Gamma reference");
  const moveTo = page.getByRole("menuitem", { name: "Move to" });
  await moveTo.focus();
  await moveTo.press("ArrowRight");
  await expectOverlayContained(page, page.getByRole("menu").last());
  await page.getByRole("menuitem", { name: "Archive" }).press("Enter");
  await expect(page.getByRole("listbox", { name: "Archive notes" }).getByText("Gamma reference")).toBeVisible();

  await openNoteMenu(page, "Gamma reference");
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("option", { name: "Note: Gamma reference" })).toHaveCount(0);
  await choosePanelMenuAction(page, "Undo");
  await expect(page.getByRole("option", { name: "Note: Gamma reference" })).toBeVisible();
  await expectSurfaceContained(page, "notes");

  await kopper.closeKopper();
  const persisted = await kopper.readPersistedDocument();
  expect(persisted.sections.map(({ title }) => title)).toEqual([
    "Inbox",
    "Archive",
    "Projects",
  ]);
  expect(persisted.notes.map(({ body }) => body).sort()).toEqual([
    "Alpha finding\n\nBeta decision",
    "Gamma reference",
  ]);
  expect(
    persisted.sections.find(({ id }) =>
      persisted.notes.some((note) => note.body === "Gamma reference" && note.sectionId === id),
    )?.title,
  ).toBe("Archive");

  const relaunched = await kopper.relaunchKopper();
  await continueWithoutCaptureIfNeeded(relaunched);
  await expect(
    relaunched.getByRole("option", { name: "Note: Alpha finding\n\nBeta decision" }),
  ).toBeVisible();
  await expect(relaunched.getByRole("option", { name: "Note: Gamma reference" })).toBeVisible();
  await kopper.closeKopper();
});
