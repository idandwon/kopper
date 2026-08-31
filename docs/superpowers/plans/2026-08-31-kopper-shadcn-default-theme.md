# Kopper Shadcn Default Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace Kopper's branded bundled themes with one official shadcn New York Neutral Default theme while preserving custom themes and transparently resolving legacy bundled IDs.

**Architecture:** src/shared/theme/presets.ts owns one canonical bundled definition plus a narrow legacy-ID resolver. Domain defaults and renderer fallbacks point to the canonical definition; Appearance Settings projects only that definition plus stored custom themes and treats legacy IDs as the same active built-in theme. Custom-theme schemas, persistence, previews, import/export, and IPC remain unchanged.

**Tech Stack:** TypeScript 7, React 19, Electron 43, Tailwind CSS 4, shadcn New York primitives, Vitest 4, Testing Library, Playwright 1.62

**Spec:** docs/superpowers/specs/2026-08-31-kopper-shadcn-default-theme-design.md

## Global Constraints

- Keep components.json at New York, Neutral, and CSS variables enabled.
- Keep every file under src/renderer/src/components/ui/ byte-for-byte unchanged.
- The only bundled theme is Default, ID builtin:shadcn-default, with the exact values in spec section 4.
- Existing active custom themes stay active and every custom-theme workflow remains functional.
- Legacy bundled IDs resolve to Default without rewriting a document merely because it opened.
- Keep persisted document schema 1, theme-file version 1, preload APIs, and IPC unchanged.
- Add no dependency, raw feature color, arbitrary geometry, custom radius, component-size override, border, shadow, or focus treatment.
- Use existing primitive APIs, semantic tokens, and Tailwind scale for renderer composition.
- Packaging, versioning, installer work, tagging, and release are out of scope.

---

## File Structure

- src/shared/theme/presets.ts: canonical theme, bundled list, legacy-ID predicate, resolution.
- src/shared/domain/document.ts: new-document theme ID.
- src/shared/domain/commands.ts: activation validation and deletion fallback.
- src/renderer/src/theme/ThemeProvider.tsx: unloaded and unresolved fallback.
- src/renderer/src/features/settings/AppearanceSettings.tsx: Default/custom projection and legacy active state.
- Corresponding test files: exact values and behavioral coverage.
- tests/e2e/demo-parity.spec.ts and tests/e2e/theme-workflows.spec.ts: neutral visual/workflow evidence.
- Current-source fixtures: rename the built-in fixture export without changing wire contracts.
- Historical specs, plans, and release records stay unchanged because they describe their recorded state.

---

### Task 1: Canonical theme and legacy resolver

**Files:**
- Modify: src/shared/theme/presets.ts
- Modify: src/shared/theme/presets.test.ts

**Interfaces:**
- Produces: SHADCN_DEFAULT_THEME: ThemeDefinition
- Produces: LEGACY_BUNDLED_THEME_IDS: readonly string[]
- Produces: isBundledThemeId(id: string): boolean
- Preserves: BUNDLED_THEMES and getThemeById(...)

- [ ] **Step 1: Record primitive checksums**

    find src/renderer/src/components/ui -type f -print0 | sort -z | xargs -0 shasum -a 256 > /tmp/kopper-shadcn-primitives-before.sha256

Expected: one checksum per primitive and no working-tree change.

- [ ] **Step 2: Write failing preset tests**

Add exact identity, token, and alias assertions while retaining schema, radius, lifecycle-derivation, and readability tests:

    expect(BUNDLED_THEMES).toEqual([SHADCN_DEFAULT_THEME]);
    expect(SHADCN_DEFAULT_THEME).toMatchObject({
      id: "builtin:shadcn-default",
      version: 1,
      name: "Default",
      light: {
        background: "oklch(1 0 0)",
        foreground: "oklch(0.145 0 0)",
        card: "oklch(1 0 0)",
        "card-foreground": "oklch(0.145 0 0)",
        popover: "oklch(1 0 0)",
        "popover-foreground": "oklch(0.145 0 0)",
        primary: "oklch(0.205 0 0)",
        "primary-foreground": "oklch(0.985 0 0)",
        secondary: "oklch(0.97 0 0)",
        "secondary-foreground": "oklch(0.205 0 0)",
        muted: "oklch(0.97 0 0)",
        "muted-foreground": "oklch(0.556 0 0)",
        accent: "oklch(0.97 0 0)",
        "accent-foreground": "oklch(0.205 0 0)",
        destructive: "oklch(0.577 0.245 27.325)",
        "destructive-foreground": "oklch(0.985 0 0)",
        border: "oklch(0.922 0 0)",
        input: "oklch(0.922 0 0)",
        ring: "oklch(0.708 0 0)",
        radius: "0.625rem",
      },
      dark: {
        background: "oklch(0.145 0 0)",
        foreground: "oklch(0.985 0 0)",
        card: "oklch(0.205 0 0)",
        "card-foreground": "oklch(0.985 0 0)",
        popover: "oklch(0.205 0 0)",
        "popover-foreground": "oklch(0.985 0 0)",
        primary: "oklch(0.922 0 0)",
        "primary-foreground": "oklch(0.205 0 0)",
        secondary: "oklch(0.269 0 0)",
        "secondary-foreground": "oklch(0.985 0 0)",
        muted: "oklch(0.269 0 0)",
        "muted-foreground": "oklch(0.708 0 0)",
        accent: "oklch(0.269 0 0)",
        "accent-foreground": "oklch(0.985 0 0)",
        destructive: "oklch(0.704 0.191 22.216)",
        "destructive-foreground": "oklch(0.985 0 0)",
        border: "oklch(1 0 0 / 10%)",
        input: "oklch(1 0 0 / 15%)",
        ring: "oklch(0.556 0 0)",
        radius: "0.625rem",
      },
    });

    it.each(LEGACY_BUNDLED_THEME_IDS)("resolves %s to Default", (id) => {
      expect(isBundledThemeId(id)).toBe(true);
      expect(getThemeById({ customThemes: [] }, id)).toBe(SHADCN_DEFAULT_THEME);
    });

Remove the old requirement that light cards/popovers differ from the background; stock shadcn intentionally gives them the same value.

- [ ] **Step 3: Verify the tests fail**

    pnpm exec vitest run src/shared/theme/presets.test.ts

Expected: FAIL because the new exports and one-theme list do not exist.

- [ ] **Step 4: Implement the canonical definition**

Keep createMode for foreground pairing, fixed radius, and lifecycle derivation. Replace the three presets with:

    export const LEGACY_BUNDLED_THEME_IDS = [
      "builtin:oxide-ledger",
      "builtin:night-workshop",
      "builtin:index-drawer",
    ] as const;

    const bundledThemeIds = new Set<string>([
      "builtin:shadcn-default",
      ...LEGACY_BUNDLED_THEME_IDS,
    ]);

    export const SHADCN_DEFAULT_THEME: ThemeDefinition = {
      id: "builtin:shadcn-default",
      version: 1,
      name: "Default",
      light: createMode({
        background: "oklch(1 0 0)",
        card: "oklch(1 0 0)",
        popover: "oklch(1 0 0)",
        foreground: "oklch(0.145 0 0)",
        primary: "oklch(0.205 0 0)",
        primaryForeground: "oklch(0.985 0 0)",
        secondary: "oklch(0.97 0 0)",
        secondaryForeground: "oklch(0.205 0 0)",
        muted: "oklch(0.97 0 0)",
        mutedForeground: "oklch(0.556 0 0)",
        accent: "oklch(0.97 0 0)",
        accentForeground: "oklch(0.205 0 0)",
        destructive: "oklch(0.577 0.245 27.325)",
        destructiveForeground: "oklch(0.985 0 0)",
        border: "oklch(0.922 0 0)",
        input: "oklch(0.922 0 0)",
        ring: "oklch(0.708 0 0)",
      }),
      dark: createMode({
        background: "oklch(0.145 0 0)",
        card: "oklch(0.205 0 0)",
        popover: "oklch(0.205 0 0)",
        foreground: "oklch(0.985 0 0)",
        primary: "oklch(0.922 0 0)",
        primaryForeground: "oklch(0.205 0 0)",
        secondary: "oklch(0.269 0 0)",
        secondaryForeground: "oklch(0.985 0 0)",
        muted: "oklch(0.269 0 0)",
        mutedForeground: "oklch(0.708 0 0)",
        accent: "oklch(0.269 0 0)",
        accentForeground: "oklch(0.985 0 0)",
        destructive: "oklch(0.704 0.191 22.216)",
        destructiveForeground: "oklch(0.985 0 0)",
        border: "oklch(1 0 0 / 10%)",
        input: "oklch(1 0 0 / 15%)",
        ring: "oklch(0.556 0 0)",
      }),
    };

    export const BUNDLED_THEMES = [SHADCN_DEFAULT_THEME] as const;

    export function isBundledThemeId(id: string): boolean {
      return bundledThemeIds.has(id);
    }

export function getThemeById(
  document: Pick<KopperDocument, "customThemes">,
  id: string,
): ThemeDefinition | null {
  if (isBundledThemeId(id)) return SHADCN_DEFAULT_THEME;
  return document.customThemes.find((theme) => theme.id === id) ?? null;
}

/** @deprecated Temporary fixture bridge; remove in Task 4. */
export const OXIDE_LEDGER_THEME = SHADCN_DEFAULT_THEME;

- [ ] **Step 5: Verify and commit**

    pnpm exec vitest run src/shared/theme/presets.test.ts
    git add src/shared/theme/presets.ts src/shared/theme/presets.test.ts
    git commit -m "feat: use shadcn neutral as default theme"

Expected: PASS and one focused commit.

---

### Task 2: Domain defaults and fallbacks

**Files:**
- Modify: src/shared/domain/document.ts
- Modify: src/shared/domain/document.test.ts
- Modify: src/shared/domain/commands.ts
- Modify: src/shared/domain/commands.test.ts

**Interfaces:**
- Consumes: SHADCN_DEFAULT_THEME and isBundledThemeId
- Produces: canonical new-document and active-custom-deletion defaults

- [ ] **Step 1: Write failing domain tests**

    expect(createEmptyDocument(now).appearance).toEqual({
      mode: "system",
      activeThemeId: SHADCN_DEFAULT_THEME.id,
    });

    expect(apply(document, {
      type: "appearance.setActiveTheme",
      themeId: "builtin:oxide-ledger",
    }).appearance.activeThemeId).toBe("builtin:oxide-ledger");

    expect(activeDeleted.appearance.activeThemeId).toBe(SHADCN_DEFAULT_THEME.id);

Also assert canonical and legacy bundled IDs cannot be deleted, while canonical and custom themes can be activated.

- [ ] **Step 2: Verify old behavior fails**

    pnpm exec vitest run src/shared/domain/document.test.ts src/shared/domain/commands.test.ts

Expected: FAIL on the old document ID and deletion fallback.

- [ ] **Step 3: Implement domain behavior**

Set createEmptyDocument(...).appearance.activeThemeId to SHADCN_DEFAULT_THEME.id. In applyAppearanceCommand use:

    const exists =
      isBundledThemeId(command.themeId) ||
      document.customThemes.some(({ id }) => id === command.themeId);

    if (isBundledThemeId(command.themeId)) {
      return validationError("Bundled themes cannot be deleted.");
    }

    if (document.appearance.activeThemeId === command.themeId) {
      document.appearance.activeThemeId = SHADCN_DEFAULT_THEME.id;
    }

Do not normalize legacy IDs inside parseDocument.

- [ ] **Step 4: Verify and commit**

    pnpm exec vitest run src/shared/domain/document.test.ts src/shared/domain/commands.test.ts
    pnpm typecheck
    git add src/shared/domain/document.ts src/shared/domain/document.test.ts src/shared/domain/commands.ts src/shared/domain/commands.test.ts
    git commit -m "feat: migrate document theme defaults"

The temporary fixture bridge from Task 1 keeps untouched tests type-correct. Task 4 must migrate every consumer and remove it.

---

### Task 3: ThemeProvider and Appearance Settings

**Files:**
- Modify: src/renderer/src/theme/ThemeProvider.tsx
- Modify: src/renderer/src/theme/ThemeProvider.test.tsx
- Modify: src/renderer/src/features/settings/AppearanceSettings.tsx
- Modify: src/renderer/src/features/settings/AppearanceSettings.test.tsx
- Modify: src/renderer/src/app/DocumentPanel.theme-preview.test.tsx

**Interfaces:**
- Consumes: SHADCN_DEFAULT_THEME and isBundledThemeId
- Preserves: preview ownership, explicit saves, appearance commands, and primitive composition

- [ ] **Step 1: Write failing renderer tests**

Cover unloaded, missing, legacy, and custom precedence:

    setDocumentContext(makeDocument({ mode: "light" }), false);
    expect(renderHook(() => useTheme(), { wrapper }).result.current.activeTheme)
      .toBe(SHADCN_DEFAULT_THEME);

    setDocumentContext(
      makeDocument({ mode: "light", activeThemeId: "builtin:night-workshop" }),
      true,
    );
    expect(renderHook(() => useTheme(), { wrapper }).result.current.activeTheme)
      .toBe(SHADCN_DEFAULT_THEME);

    const custom = customTheme();
    setDocumentContext(
      makeDocument({ mode: "dark", activeThemeId: custom.id }, [custom]),
      true,
    );
    expect(renderHook(() => useTheme(), { wrapper }).result.current.activeTheme)
      .toBe(custom);

Cover Settings projection using a legacy active ID:

    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.queryByText("Oxide Ledger")).not.toBeInTheDocument();
    expect(screen.queryByText("Night Workshop")).not.toBeInTheDocument();
    expect(screen.queryByText("Index Drawer")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Active Default" })).toBeDisabled();

Retain tests proving Default offers Customize/Export and custom themes offer Edit/Export/Delete.

- [ ] **Step 2: Verify renderer tests fail**

    pnpm exec vitest run src/renderer/src/theme/ThemeProvider.test.tsx src/renderer/src/features/settings/AppearanceSettings.test.tsx src/renderer/src/app/DocumentPanel.theme-preview.test.tsx

Expected: FAIL on fallback identity, old rows, and legacy active-state comparison.

- [ ] **Step 3: Implement renderer projection without styling changes**

Use SHADCN_DEFAULT_THEME for unloaded and unresolved fallbacks. In AppearanceSettings.tsx retain the existing list composition and calculate:

    const active =
      theme.id === SHADCN_DEFAULT_THEME.id
        ? isBundledThemeId(document.appearance.activeThemeId)
        : theme.id === document.appearance.activeThemeId;

Change the non-null deletion description to this exact expression:

    `${deleteTheme.name} will be removed. If active, Default becomes active.`

Do not change classes, primitive files, sizes, spacing, menu/dialog structure, or feedback behavior.

- [ ] **Step 4: Verify and commit**

    pnpm exec vitest run src/renderer/src/theme/ThemeProvider.test.tsx src/renderer/src/features/settings/AppearanceSettings.test.tsx src/renderer/src/app/DocumentPanel.theme-preview.test.tsx
    git add src/renderer/src/theme/ThemeProvider.tsx src/renderer/src/theme/ThemeProvider.test.tsx src/renderer/src/features/settings/AppearanceSettings.tsx src/renderer/src/features/settings/AppearanceSettings.test.tsx src/renderer/src/app/DocumentPanel.theme-preview.test.tsx
    git commit -m "feat: present shadcn default appearance"

Expected: PASS; Default is the sole built-in row and custom behavior remains.

---

### Task 4: Fixture migration, visuals, and final verification

**Files:**
- Modify: src/main/domain/commandService.test.ts
- Modify: src/main/files/documentFiles.test.ts
- Modify: src/main/ipc/registerIpcHandlers.test.ts
- Modify: src/main/persistence/noteRepository.test.ts
- Modify: src/main/theme/themeFiles.test.ts
- Modify: src/preload/index.test.ts
- Modify: src/renderer/src/app/App.test.tsx
- Modify: src/renderer/src/app/DocumentPanel.theme-preview.test.tsx
- Modify: src/renderer/src/features/settings/AppearanceSettings.test.tsx
- Modify: src/renderer/src/features/settings/ThemeEditor.test.tsx
- Modify: src/renderer/src/features/settings/ThemeImportDialog.test.tsx
- Modify: src/renderer/src/theme/ThemeProvider.test.tsx
- Modify: src/renderer/src/theme/applyTheme.test.ts
- Modify: src/shared/domain/commands.test.ts
- Modify: src/shared/domain/document.test.ts
- Modify: src/shared/ipc/contract.test.ts
- Modify: src/shared/theme/presets.test.ts
- Modify: tests/e2e/demo-parity.spec.ts
- Modify: tests/e2e/theme-workflows.spec.ts
- Delete: nine obsolete Oxide-named PNG baselines
- Create: Default-named PNG baselines generated by Playwright

**Interfaces:**
- Consumes: SHADCN_DEFAULT_THEME
- Removes: temporary OXIDE_LEDGER_THEME export bridge
- Preserves: theme file format, IPC/preload shape, and custom-theme test behavior

- [ ] **Step 1: Migrate fixture imports and remove the bridge**

Use the canonical definition as the base for test custom themes:

    import { SHADCN_DEFAULT_THEME } from "../../shared/theme/presets";

    const customTheme = {
      ...structuredClone(SHADCN_DEFAULT_THEME),
      id: "custom:test-theme",
      name: "Test theme",
    };

Apply the correct relative path in each file. Keep old IDs only in explicit legacy tests. Remove the temporary alias, then run:

    rg -n "OXIDE_LEDGER_THEME" src tests

Expected: no matches.

- [ ] **Step 2: Update E2E semantics and screenshot names**

Set demo documents to builtin:shadcn-default. Rename oxide-ledger screenshot keys to shadcn-default keys.

Replace the three-preset activation loop with:

    await expect(
      page.getByRole("button", { name: "Active Default" }),
    ).toBeVisible();

Customize Default, expect Default Custom, use #FFFFFF as the unreadable light foreground and #171717 as the readable replacement, and retain edit/export/import/preview/delete coverage. Rename the editor screenshot key to shadcn-default-theme-editor-light-340x480.png.

- [ ] **Step 3: Run focused integration checks**

    pnpm exec vitest run src/shared/theme/presets.test.ts src/shared/domain/document.test.ts src/shared/domain/commands.test.ts src/renderer/src/theme/ThemeProvider.test.tsx src/renderer/src/features/settings/AppearanceSettings.test.tsx src/renderer/src/app/DocumentPanel.theme-preview.test.tsx src/main/theme/themeFiles.test.ts
    pnpm typecheck

Expected: PASS and no removed symbol.

- [ ] **Step 4: Replace visual baselines**

Remove exactly these obsolete snapshot files, then regenerate:

    git rm tests/e2e/demo-parity.spec.ts-snapshots/oxide-ledger-dark-340x480-darwin.png
    git rm tests/e2e/demo-parity.spec.ts-snapshots/oxide-ledger-dark-380x640-darwin.png
    git rm tests/e2e/demo-parity.spec.ts-snapshots/oxide-ledger-light-340x480-darwin.png
    git rm tests/e2e/demo-parity.spec.ts-snapshots/oxide-ledger-light-380x640-darwin.png
    git rm tests/e2e/demo-parity.spec.ts-snapshots/oxide-ledger-settings-dark-340x480-darwin.png
    git rm tests/e2e/demo-parity.spec.ts-snapshots/oxide-ledger-settings-dark-380x640-darwin.png
    git rm tests/e2e/demo-parity.spec.ts-snapshots/oxide-ledger-settings-light-340x480-darwin.png
    git rm tests/e2e/demo-parity.spec.ts-snapshots/oxide-ledger-settings-light-380x640-darwin.png
    git rm tests/e2e/theme-workflows.spec.ts-snapshots/oxide-ledger-theme-editor-light-340x480-darwin.png

    env -u ELECTRON_RUN_AS_NODE pnpm exec playwright test --update-snapshots

Expected: E2E passes and creates Default-named Notes, Settings, and editor images while refreshing other globally affected semantic-color baselines.

- [ ] **Step 5: Inspect the visual matrix**

Inspect these exact files:

    tests/e2e/demo-parity.spec.ts-snapshots/shadcn-default-light-340x480-darwin.png
    tests/e2e/demo-parity.spec.ts-snapshots/shadcn-default-light-380x640-darwin.png
    tests/e2e/demo-parity.spec.ts-snapshots/shadcn-default-dark-340x480-darwin.png
    tests/e2e/demo-parity.spec.ts-snapshots/shadcn-default-dark-380x640-darwin.png
    tests/e2e/demo-parity.spec.ts-snapshots/shadcn-default-settings-light-340x480-darwin.png
    tests/e2e/demo-parity.spec.ts-snapshots/shadcn-default-settings-light-380x640-darwin.png
    tests/e2e/demo-parity.spec.ts-snapshots/shadcn-default-settings-dark-340x480-darwin.png
    tests/e2e/demo-parity.spec.ts-snapshots/shadcn-default-settings-dark-380x640-darwin.png
    tests/e2e/theme-workflows.spec.ts-snapshots/shadcn-default-theme-editor-light-340x480-darwin.png

Reject low contrast, overflow, duplicate theme rows, missing active state, inconsistent primitive state, or unrelated geometry changes.

- [ ] **Step 6: Prove primitives and global styling are unchanged**

    find src/renderer/src/components/ui -type f -print0 | sort -z | xargs -0 shasum -a 256 > /tmp/kopper-shadcn-primitives-after.sha256
    diff -u /tmp/kopper-shadcn-primitives-before.sha256 /tmp/kopper-shadcn-primitives-after.sha256
    git diff --exit-code 8ba514a -- src/renderer/src/components/ui
    git diff --exit-code 8ba514a -- src/renderer/src/styles/globals.css
    git diff --check 8ba514a
    rg -n "Night Workshop|Index Drawer|Oxide Ledger" src tests

Expected: primitive/global CSS diffs are empty, old names occur only in compatibility tests, and there are no whitespace errors.

- [ ] **Step 7: Run full verification**

    pnpm test
    pnpm typecheck
    pnpm build
    env -u ELECTRON_RUN_AS_NODE pnpm test:e2e

Expected: every command exits 0. The non-update E2E run must pass against generated images.

- [ ] **Step 8: Commit and audit**

    git add src tests
    git commit -m "test: verify shadcn default theme migration"
    git status --short
    git log --oneline --decorate -5
    git diff --exit-code 8ba514a -- src/renderer/src/components/ui

Expected: clean working tree, planned commits present, and no primitive diff.
