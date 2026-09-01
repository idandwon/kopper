# Feedback Noise Reduction and Bundled Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove redundant success and cancellation feedback while adding accessible Cobalt and Violet bundled themes that use Kopper's existing shadcn semantic system.

**Architecture:** Keep the existing feedback components intact and change only the feature call sites that decide whether an outcome deserves feedback. Extend the shared theme catalog with two color-only definitions, resolve real bundled IDs through a map, and continue mapping legacy bundled IDs to Default.

**Tech Stack:** TypeScript 7, React 19, Vitest, Testing Library, Tailwind CSS 4, shadcn New York primitives, OKLCH semantic theme tokens.

**Spec:** `docs/plans/2026-09-01-feedback-and-themes-design.md`

## Global Constraints

- Keep `Default` as the initial and fallback bundled theme.
- Keep custom themes and theme-file version 1 unchanged.
- Keep persisted document schemas and IPC channels unchanged.
- Do not modify any file under `src/renderer/src/components/ui`.
- Do not modify `src/renderer/src/styles/globals.css`.
- Use the existing fixed `0.625rem` radius and existing semantic token contract.
- Keep all errors, operational progress, empty capture results, clipboard feedback, capture feedback, export/import completion, accessibility feedback, and recovery completion.
- Add no dependencies and no feature-level component styling.

---

### Task 1: Add Cobalt and Violet to the bundled theme catalog

**Files:**
- Modify: `src/shared/theme/presets.test.ts`
- Modify: `src/shared/theme/presets.ts`
- Modify: `src/renderer/src/features/settings/AppearanceSettings.test.tsx`
- Modify: `src/renderer/src/features/settings/AppearanceSettings.tsx`

**Interfaces:**
- Produces: `COBALT_THEME: ThemeDefinition`
- Produces: `VIOLET_THEME: ThemeDefinition`
- Produces: `BUNDLED_THEMES` ordered as Default, Cobalt, Violet.
- Preserves: `isBundledThemeId(id: string): boolean` accepts current and legacy bundled IDs.
- Preserves: `getThemeById(document, id): ThemeDefinition | null`, with legacy IDs resolving to Default and current bundled IDs resolving to their own definitions.

- [ ] **Step 1: Write failing catalog and lookup tests**

Import `COBALT_THEME` and `VIOLET_THEME` in `presets.test.ts`. Replace the one-theme catalog assertion and add direct resolution coverage:

```ts
expect(BUNDLED_THEMES).toEqual([
  SHADCN_DEFAULT_THEME,
  COBALT_THEME,
  VIOLET_THEME,
]);

expect(COBALT_THEME).toMatchObject({
  id: "builtin:shadcn-cobalt",
  name: "Cobalt",
  light: {
    primary: "oklch(0.488 0.243 264.376)",
    "primary-foreground": "oklch(0.985 0 0)",
    ring: "oklch(0.488 0.243 264.376)",
  },
  dark: {
    primary: "oklch(0.707 0.165 254.624)",
    "primary-foreground": "oklch(0.205 0 0)",
    ring: "oklch(0.707 0.165 254.624)",
  },
});

expect(VIOLET_THEME).toMatchObject({
  id: "builtin:shadcn-violet",
  name: "Violet",
  light: {
    primary: "oklch(0.491 0.27 292.581)",
    "primary-foreground": "oklch(0.985 0 0)",
    ring: "oklch(0.491 0.27 292.581)",
  },
  dark: {
    primary: "oklch(0.702 0.183 293.541)",
    "primary-foreground": "oklch(0.205 0 0)",
    ring: "oklch(0.702 0.183 293.541)",
  },
});

it.each([COBALT_THEME, VIOLET_THEME])(
  "resolves $id to its own bundled definition",
  (theme) => {
    expect(isBundledThemeId(theme.id)).toBe(true);
    expect(getThemeById({ customThemes: [] }, theme.id)).toBe(theme);
  },
);
```

Keep the existing `it.each(BUNDLED_THEMES)` schema, derivation, radius, compatibility-token, and readability test so the two new themes automatically enter the full validation matrix.

In `AppearanceSettings.test.tsx`, add a projection test using `activeThemeId: COBALT_THEME.id`. Assert Cobalt is the only disabled `Active` button, Default and Violet expose enabled `Activate` buttons, and all three bundled names are present.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
pnpm exec vitest run src/shared/theme/presets.test.ts src/renderer/src/features/settings/AppearanceSettings.test.tsx
```

Expected: FAIL because Cobalt and Violet exports do not exist and the settings list has only Default.

- [ ] **Step 3: Implement the two color-only definitions and exact lookup**

In `presets.ts`, add a private helper after `SHADCN_DEFAULT_THEME` that copies the Default semantic surface hierarchy and changes only primary, primary foreground, ring, and the derived capture compatibility token:

```ts
function createAccentTheme({
  id,
  name,
  lightPrimary,
  lightPrimaryForeground,
  darkPrimary,
  darkPrimaryForeground,
}: {
  id: string;
  name: string;
  lightPrimary: string;
  lightPrimaryForeground: string;
  darkPrimary: string;
  darkPrimaryForeground: string;
}): ThemeDefinition {
  return {
    id,
    version: 1,
    name,
    light: {
      ...SHADCN_DEFAULT_THEME.light,
      primary: lightPrimary,
      "primary-foreground": lightPrimaryForeground,
      ring: lightPrimary,
      capture: lightPrimary,
    },
    dark: {
      ...SHADCN_DEFAULT_THEME.dark,
      primary: darkPrimary,
      "primary-foreground": darkPrimaryForeground,
      ring: darkPrimary,
      capture: darkPrimary,
    },
  };
}
```

Create the definitions with the tested values:

```ts
export const COBALT_THEME = createAccentTheme({
  id: "builtin:shadcn-cobalt",
  name: "Cobalt",
  lightPrimary: "oklch(0.488 0.243 264.376)",
  lightPrimaryForeground: "oklch(0.985 0 0)",
  darkPrimary: "oklch(0.707 0.165 254.624)",
  darkPrimaryForeground: "oklch(0.205 0 0)",
});

export const VIOLET_THEME = createAccentTheme({
  id: "builtin:shadcn-violet",
  name: "Violet",
  lightPrimary: "oklch(0.491 0.27 292.581)",
  lightPrimaryForeground: "oklch(0.985 0 0)",
  darkPrimary: "oklch(0.702 0.183 293.541)",
  darkPrimaryForeground: "oklch(0.205 0 0)",
});

export const BUNDLED_THEMES = [
  SHADCN_DEFAULT_THEME,
  COBALT_THEME,
  VIOLET_THEME,
] as const;
```

Replace the current all-to-Default set lookup with exact current-theme resolution plus the legacy fallback:

```ts
const bundledThemesById = new Map<string, ThemeDefinition>(
  BUNDLED_THEMES.map((theme) => [theme.id, theme]),
);
const legacyBundledThemeIds = new Set<string>(LEGACY_BUNDLED_THEME_IDS);

export function isBundledThemeId(id: string): boolean {
  return bundledThemesById.has(id) || legacyBundledThemeIds.has(id);
}

export function getThemeById(
  document: Pick<KopperDocument, "customThemes">,
  id: string,
): ThemeDefinition | null {
  const bundled = bundledThemesById.get(id);
  if (bundled !== undefined) return bundled;
  if (legacyBundledThemeIds.has(id)) return SHADCN_DEFAULT_THEME;
  return document.customThemes.find((theme) => theme.id === id) ?? null;
}
```

In `AppearanceSettings.tsx`, replace the special-case `isBundledThemeId` projection with the canonical resolved ID:

```ts
const activeThemeId =
  getThemeById(document, document.appearance.activeThemeId)?.id ??
  SHADCN_DEFAULT_THEME.id;

// Inside themes.map:
const active = theme.id === activeThemeId;
```

This keeps legacy IDs projected onto Default without accidentally marking Default active when Cobalt or Violet is selected.

- [ ] **Step 4: Run focused theme tests and verify success**

Run:

```bash
pnpm exec vitest run src/shared/theme/presets.test.ts src/renderer/src/features/settings/AppearanceSettings.test.tsx src/renderer/src/theme/ThemeProvider.test.tsx src/shared/domain/commands.test.ts
```

Expected: PASS, including readability ratios of at least 4.5:1 for every required pair.

- [ ] **Step 5: Commit the bundled themes**

```bash
git add src/shared/theme/presets.ts src/shared/theme/presets.test.ts src/renderer/src/features/settings/AppearanceSettings.tsx src/renderer/src/features/settings/AppearanceSettings.test.tsx
git commit -m "feat: add cobalt and violet themes"
```

---

### Task 2: Remove redundant appearance and theme confirmations

**Files:**
- Modify: `src/renderer/src/features/settings/AppearanceSettings.test.tsx`
- Modify: `src/renderer/src/features/settings/AppearanceSettings.tsx`
- Modify: `src/renderer/src/features/settings/ThemeImportDialog.test.tsx`
- Modify: `src/renderer/src/features/settings/ThemeImportDialog.tsx`

**Interfaces:**
- Consumes: Existing `SettingsFeedbackValue` and theme commands.
- Produces: No new interface. Successful visible theme changes are silent; errors and invisible export completion remain visible.

- [ ] **Step 1: Write failing feedback-policy tests**

Update the mode test to retain the command and accessible selected/resolved status assertions while proving the redundant confirmation is absent:

```ts
expect(execute).toHaveBeenCalledWith({
  type: "appearance.setMode",
  mode: "light",
});
expect(
  screen.queryByText("Appearance mode changed to light."),
).not.toBeInTheDocument();
```

Add successful activation and deletion cases that assert the command was acknowledged but `Theme activated.` and `Custom theme deleted.` are absent. Keep the existing failure deletion test unchanged.

Add export cases proving a completed export still renders `Theme exported.`, a cancelled export renders no `Export cancelled.`, and a failed export remains an alert.

In `ThemeImportDialog.test.tsx`, replace the successful-save status assertion with:

```ts
expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
expect(
  screen.queryByText(/saved and activated/i),
).not.toBeInTheDocument();
```

Keep both existing save failure outcomes as alerts.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
pnpm exec vitest run src/renderer/src/features/settings/AppearanceSettings.test.tsx src/renderer/src/features/settings/ThemeImportDialog.test.tsx
```

Expected: FAIL on existing mode, activation, deletion, cancellation, and imported-theme success messages.

- [ ] **Step 3: Make visible appearance changes silent**

In `AppearanceSettings.tsx`:

- After `appearance.setMode`, set error feedback only when `changed` is false.
- After `appearance.setActiveTheme`, set error feedback only when `saved` is false.
- After a successful theme export, keep `Theme exported.` only when the returned value is non-null; leave feedback null for cancellation.
- After `appearance.deleteCustomTheme`, close the dialog on success and set feedback only on failure.

Use these concrete branches:

```ts
if (!changed) {
  setFeedback({
    text: "Appearance mode could not be changed.",
    tone: "error",
  });
}

if (!saved) {
  setFeedback({ text: "Theme activation failed.", tone: "error" });
}

if (result.value !== null) {
  setFeedback({ text: "Theme exported.", tone: "status" });
}

if (deleted) {
  setDeleteTheme(null);
} else {
  setFeedback({
    text: "Custom theme could not be deleted.",
    tone: "error",
  });
}
```

In `ThemeImportDialog.tsx`, keep closing and clearing preview ownership on `saved`, but replace the success message with `setMessage(null)`.

- [ ] **Step 4: Run focused appearance tests and verify success**

Run:

```bash
pnpm exec vitest run src/renderer/src/features/settings/AppearanceSettings.test.tsx src/renderer/src/features/settings/ThemeImportDialog.test.tsx
```

Expected: PASS. Successful visible changes have no announcement; export completion and every failure remain visible.

- [ ] **Step 5: Commit the appearance feedback cleanup**

```bash
git add src/renderer/src/features/settings/AppearanceSettings.tsx src/renderer/src/features/settings/AppearanceSettings.test.tsx src/renderer/src/features/settings/ThemeImportDialog.tsx src/renderer/src/features/settings/ThemeImportDialog.test.tsx
git commit -m "refactor: quiet visible theme changes"
```

---

### Task 3: Remove redundant shortcut and pin confirmations

**Files:**
- Modify: `src/renderer/src/features/settings/ShortcutSettings.test.tsx`
- Modify: `src/renderer/src/features/settings/ShortcutSettings.tsx`
- Modify: `src/renderer/src/app/App.test.tsx`
- Modify: `src/renderer/src/features/panel/PanelPinButton.tsx`

**Interfaces:**
- Consumes: Existing acknowledged `saveShortcuts` and `setPinned` results.
- Produces: No new interface. Successful save, reset, pin, unpin, and Escape cancellation paths are silent; progress, capture results, and failures remain visible.

- [ ] **Step 1: Write failing shortcut and pin tests**

In `ShortcutSettings.test.tsx`:

- Change both Escape tests to assert recording ends and `Shortcut recording cancelled.` is absent.
- Change reset and successful save coverage to assert the API receives the expected value and neither `Shortcuts saved.` nor `Shortcuts reset to defaults.` appears.
- Add successful pin coverage that asserts `setPinned` receives the inverted state and neither `Panel pinned.` nor `Panel unpinned.` appears.
- Keep the validation failure, save failure, pin failure, `Testing capture…`, captured/empty test result, and rejected capture tests.

In `App.test.tsx`, rename the pin feedback test to describe silent success and visible failure. After successful pin/unpin, assert no `[data-slot="toast"]` exists. Keep the error path assertion:

```ts
expect(
  globalThis.document.querySelector('[data-slot="toast"]'),
).not.toBeInTheDocument();

expect(screen.getByRole("alert")).toHaveTextContent(
  "The panel pin could not be saved.",
);
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
pnpm exec vitest run src/renderer/src/features/settings/ShortcutSettings.test.tsx src/renderer/src/app/App.test.tsx
```

Expected: FAIL because successful saves and pin changes still publish feedback and Escape still announces cancellation.

- [ ] **Step 3: Remove only redundant shortcut and pin notices**

In `ShortcutSettings.tsx`:

- On Escape, end recording and clear feedback with `setFeedback(null)`.
- After an acknowledged shortcut save, update `candidate` and leave feedback null.
- After an acknowledged pin change, leave feedback null.
- Keep the recording instruction, validation errors, save errors, pin errors, `Testing capture…`, `Test capture saved.`, `No selected text was found.`, and capture errors unchanged.

The `save` signature no longer needs the `reset` boolean. Change it to:

```ts
const save = async (preferences: ShortcutPreferences) => {
```

Update both call sites to pass only the preferences object.

In `PanelPinButton.tsx`, keep `reportNotice` for the two error paths, and remove only:

```ts
reportNotice(
  result.value.window.pinned ? "Panel pinned." : "Panel unpinned.",
);
```

- [ ] **Step 4: Run focused shortcut and shell tests and verify success**

Run:

```bash
pnpm exec vitest run src/renderer/src/features/settings/ShortcutSettings.test.tsx src/renderer/src/app/App.test.tsx src/renderer/src/features/feedback/PanelFeedback.test.tsx
```

Expected: PASS. Clipboard notifications remain covered by `PanelFeedback.test.tsx` while pin successes no longer create toasts.

- [ ] **Step 5: Commit the shortcut and pin cleanup**

```bash
git add src/renderer/src/features/settings/ShortcutSettings.tsx src/renderer/src/features/settings/ShortcutSettings.test.tsx src/renderer/src/features/panel/PanelPinButton.tsx src/renderer/src/app/App.test.tsx
git commit -m "refactor: quiet shortcut and pin updates"
```

---

### Task 4: Make native file-picker cancellation silent

**Files:**
- Modify: `src/renderer/src/features/settings/DataSettings.test.tsx`
- Modify: `src/renderer/src/features/settings/DataSettings.tsx`
- Modify: `src/renderer/src/features/recovery/RecoveryScreen.test.tsx`
- Modify: `src/renderer/src/features/recovery/RecoveryScreen.tsx`

**Interfaces:**
- Consumes: Existing nullable/cancelled data and recovery IPC results.
- Produces: No new interface. Native picker cancellation leaves no message; successful export/import/recovery and failures remain visible.

- [ ] **Step 1: Write failing cancellation tests**

In `DataSettings.test.tsx`, replace the cancellation success test with assertions that both cancelled export and cancelled import produce no status or alert:

```ts
await user.click(screen.getByRole("button", { name: "Export data" }));
expect(screen.queryByText("Export cancelled.")).not.toBeInTheDocument();

api.chooseDataImport.mockResolvedValueOnce({ ok: true, value: null });
await user.click(screen.getByRole("button", { name: "Import data" }));
expect(screen.queryByText("Import cancelled.")).not.toBeInTheDocument();
```

Add a successful export case that expects `Exported kopper-backup.json.` and retain the existing `Import complete.` assertion and error coverage.

In `RecoveryScreen.test.tsx`, add a test that clicks cancelled import and damaged-content export actions and proves `Import cancelled.` and `Damaged-content export cancelled.` are absent. Add a successful damaged-content export assertion for `Exported damaged.json unchanged.`. Keep recovery import completion, new-store completion, and failures unchanged.

- [ ] **Step 2: Run focused file-workflow tests and verify failure**

Run:

```bash
pnpm exec vitest run src/renderer/src/features/settings/DataSettings.test.tsx src/renderer/src/features/recovery/RecoveryScreen.test.tsx
```

Expected: FAIL because cancellation messages are still rendered.

- [ ] **Step 3: Remove cancellation messages without suppressing real outcomes**

In `DataSettings.tsx`, keep `setFeedback(null)` at operation start, then handle success as follows:

```ts
if (!result.ok) {
  setFeedback({ text: result.error.message, tone: "error" });
} else if (!result.value.cancelled) {
  setFeedback({
    text: `Exported ${result.value.fileName ?? "Kopper data"}.`,
    tone: "status",
  });
}
```

For `chooseDataImport`, keep the error branch and set preview only when `result.value !== null`; do not create feedback for null.

In `RecoveryScreen.tsx`, clear stale messages with `setMessage(null)` at the start of `chooseImport` and `exportDamaged`. Return silently for a null import preview or `{ cancelled: true }`. Keep successful recovery export text and every failure unchanged.

- [ ] **Step 4: Run focused file-workflow tests and verify success**

Run:

```bash
pnpm exec vitest run src/renderer/src/features/settings/DataSettings.test.tsx src/renderer/src/features/recovery/RecoveryScreen.test.tsx
```

Expected: PASS. Cancellation is inert, while significant file outcomes remain visible.

- [ ] **Step 5: Commit the file-picker cleanup**

```bash
git add src/renderer/src/features/settings/DataSettings.tsx src/renderer/src/features/settings/DataSettings.test.tsx src/renderer/src/features/recovery/RecoveryScreen.tsx src/renderer/src/features/recovery/RecoveryScreen.test.tsx
git commit -m "refactor: silence file picker cancellation"
```

---

### Task 5: Verify the complete behavior and design-system boundary

**Files:**
- Verify only: `src/renderer/src/components/ui/**`
- Verify only: `src/renderer/src/styles/globals.css`
- Verify only: all files changed by Tasks 1-4.

**Interfaces:**
- Consumes: Completed theme catalog and feedback call-site changes.
- Produces: Verification evidence; no production interface.

- [ ] **Step 1: Audit all remaining user-facing feedback strings**

Run:

```bash
rg -n 'changed to|activated|deleted|pinned|unpinned|saved|cancelled|complete|exported|copied|Testing|Nothing selected|could not|failed' src/renderer/src/features --glob '!**/*.test.*'
```

Expected: no redundant appearance, theme, pin, shortcut, or picker-cancellation messages remain. Expected retained strings include clipboard copy, capture, export/import completion, recovery completion, pending work, empty capture outcomes, and errors.

- [ ] **Step 2: Prove shadcn primitives and global styling are untouched**

Use the approved design commit as the renderer implementation baseline. Run:

```bash
git diff --exit-code 49b97b4 -- src/renderer/src/components/ui src/renderer/src/styles/globals.css
```

Expected: exit 0 and no diff.

- [ ] **Step 3: Run all unit and component tests**

Run:

```bash
pnpm test
```

Expected: PASS with no failed test files or tests.

- [ ] **Step 4: Run static verification and production build**

Run:

```bash
pnpm typecheck
pnpm build
```

Expected: both commands exit 0.

- [ ] **Step 5: Run end-to-end checks and inspect final scope**

Run:

```bash
env -u ELECTRON_RUN_AS_NODE pnpm test:e2e
```

Expected: PASS, including the existing theme workflow and panel feedback coverage.

Then run:

```bash
git status --short
git diff --check
git diff 49b97b4 --stat
```

Expected: only the two plan documents, planned renderer feature files, shared theme catalog, and their tests changed after `49b97b4`; no whitespace errors and a clean working tree after the task commits.
