# Kopper Custom Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Kopper surface themeable through shadcn semantic tokens, with system appearance, bundled presets, live editing, validation, reset, and versioned JSON import/export.

**Architecture:** Shared theme schemas and derivation functions own token semantics. The main process persists validated theme commands and performs file import/export, while a renderer provider applies the active mode as root CSS variables and offers non-destructive live previews.

**Tech Stack:** React, TypeScript, shadcn/ui, Tailwind CSS, Zod, Culori, Electron nativeTheme, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-08-16-kopper-design.md`

## Global Constraints

- Complete the foundation and note-workflow plans first.
- Every component must consume semantic CSS variables; palette values may appear only in theme definitions.
- Support light, dark, and system appearance modes.
- Ship Oxide Ledger light and dark as the default and include bundled presets.
- Provide a live color and corner-radius editor, per-token reset, full reset, and versioned JSON import/export.
- Reject malformed or unreadable themes before activation; imported themes never replace the current theme automatically.
- Derive missing Kopper lifecycle tokens deterministically from shadcn tokens.
- Use test-driven development and commit after every task.

---

## Locked File Structure

```text
src/shared/theme/tokens.ts                 Canonical shadcn and Kopper token names
src/shared/theme/themeSchema.ts            Versioned theme document validation
src/shared/theme/deriveTheme.ts            Lifecycle fallback and contrast checks
src/shared/theme/presets.ts                Oxide Ledger and bundled presets
src/main/theme/themeFiles.ts                Native theme import/export
src/shared/domain/commands.ts              Appearance and custom-theme commands
src/shared/ipc/contract.ts                 Theme-file and native-appearance events
src/main/ipc/registerIpcHandlers.ts         Theme handlers
src/preload/index.ts                        Theme bridge
src/renderer/src/theme/ThemeProvider.tsx    Resolved appearance and DOM token application
src/renderer/src/theme/applyTheme.ts        Safe CSS variable application
src/renderer/src/features/settings/AppearanceSettings.tsx Mode and preset selection
src/renderer/src/features/settings/ThemeEditor.tsx Live token and radius editing
src/renderer/src/features/settings/ThemeImportDialog.tsx Validation and preview
```

## Task 1: Define Theme Tokens, Validation, Derivation, and Presets

**Files:**

- Create: `src/shared/theme/tokens.test.ts`
- Create: `src/shared/theme/tokens.ts`
- Create: `src/shared/theme/themeSchema.test.ts`
- Create: `src/shared/theme/themeSchema.ts`
- Create: `src/shared/theme/deriveTheme.test.ts`
- Create: `src/shared/theme/deriveTheme.ts`
- Create: `src/shared/theme/presets.test.ts`
- Create: `src/shared/theme/presets.ts`
- Modify: `src/shared/domain/document.ts`

**Interfaces:**

- Consumes: persisted `ThemeDefinition` and `AppearanceMode` from the version 1 document.
- Produces: `SHADCN_THEME_TOKENS`, `KOPPER_THEME_TOKENS`, `ThemeFileSchema`, `ThemeFile`, `deriveCompleteTheme(theme)`, `validateReadableTheme(theme)`, `OXIDE_LEDGER_THEME`, `BUNDLED_THEMES`, and `getThemeById(document, id)`.

- [ ] **Step 1: Write failing canonical-token tests**

Assert exact ordered names:

```ts
expect(SHADCN_THEME_TOKENS).toEqual([
  "background", "foreground", "card", "card-foreground",
  "popover", "popover-foreground", "primary", "primary-foreground",
  "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "destructive", "destructive-foreground",
  "border", "input", "ring", "radius",
]);
expect(KOPPER_THEME_TOKENS).toEqual(["capture", "organized", "completed"]);
```

- [ ] **Step 2: Write failing schema tests**

Use this external file shape:

```ts
interface ThemeFile {
  $schema: "https://kopper.local/schemas/theme-v1.json";
  version: 1;
  name: string;
  light: Record<string, string>;
  dark: Record<string, string>;
}
```

Assert rejection of unknown version, empty name, missing required shadcn tokens other than Kopper lifecycle tokens, invalid CSS colors, radius outside `0rem` through `2rem`, and prototype-polluting keys such as `__proto__` and `constructor`.

- [ ] **Step 3: Install Culori and run tests to verify failure**

Run:

```bash
pnpm add culori
pnpm add -D @types/culori
pnpm vitest run src/shared/theme
```

Expected: FAIL because theme modules do not exist.

- [ ] **Step 4: Implement schema and safe token records**

Use Zod records built from explicit allowed-token enums rather than arbitrary object spreading. Validate color strings with `culori.parse`. Validate radius with `/^(0|0?\.\d+|1(?:\.\d+)?|2(?:\.0+)?)rem$/` after normalizing zero to `0rem`.

Required imported tokens are all entries in `SHADCN_THEME_TOKENS` except `radius`, which is separately required. `capture`, `organized`, and `completed` are optional on import.

- [ ] **Step 5: Write failing derivation and readability tests**

Assert:

```ts
expect(deriveCompleteTheme(themeWithoutLifecycle).light.capture)
  .toBe(themeWithoutLifecycle.light.primary);
expect(deriveCompleteTheme(themeWithoutLifecycle).light.organized)
  .toBe(themeWithoutLifecycle.light.accent);
expect(deriveCompleteTheme(themeWithoutLifecycle).light.completed)
  .toBe(themeWithoutLifecycle.light["muted-foreground"]);
```

Use WCAG contrast calculations to require at least 4.5:1 for background/foreground, card/card-foreground, popover/popover-foreground, primary/primary-foreground, and accent/accent-foreground. Return every failing pair in one validation result.

- [ ] **Step 6: Implement deterministic derivation and readability validation**

Convert parsed colors to sRGB with Culori, composite alpha colors over their semantic background before contrast calculation, and return a structured `validation_failed` error listing token pairs and measured ratios rounded to two decimals.

- [ ] **Step 7: Define complete bundled themes**

Create `OXIDE_LEDGER_THEME` using the approved palette and explicit accessible light/dark pairings. Add two original presets:

- `night-workshop`: graphite surfaces, restrained copper action, muted verdigris completion
- `index-drawer`: paper surfaces, dark ink, brown-copper action, desaturated green completion

Every preset must pass `ThemeFileSchema`, lifecycle derivation, and readability validation in a table-driven test.

- [ ] **Step 8: Align the persisted theme type**

Replace the foundation’s open `Record<string, string>` theme type with the inferred validated `ThemeFile` token maps plus stable `id`. Keep `schemaVersion: 1` because no release exists before this task; update the version 1 schema tests and fixture in the same change so every newly created document uses the strict theme shape.

- [ ] **Step 9: Run theme unit tests**

Run:

```bash
pnpm vitest run src/shared/theme src/shared/domain/document.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit theme primitives**

```bash
git add src/shared/theme src/shared/domain/document.ts package.json pnpm-lock.yaml
 git commit -m "feat: define validated Kopper themes"
```

## Task 2: Persist Appearance and Custom Theme Commands

**Files:**

- Modify: `src/shared/domain/commands.test.ts`
- Modify: `src/shared/domain/commands.ts`
- Create: `src/main/theme/themeFiles.test.ts`
- Create: `src/main/theme/themeFiles.ts`
- Modify: `src/shared/ipc/contract.test.ts`
- Modify: `src/shared/ipc/contract.ts`
- Modify: `src/main/ipc/registerIpcHandlers.test.ts`
- Modify: `src/main/ipc/registerIpcHandlers.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**

- Consumes: `ThemeFileSchema`, `deriveCompleteTheme`, `validateReadableTheme`, `CommandService`, Electron `dialog`, and filesystem adapters.
- Produces: appearance document commands and `window.kopper.importTheme()`, `window.kopper.exportTheme(themeId)`, and `window.kopper.onNativeAppearanceChanged(listener)`.

- [ ] **Step 1: Write failing appearance-command tests**

Add and test:

```ts
| { type: "appearance.setMode"; mode: "system" | "light" | "dark" }
| { type: "appearance.setActiveTheme"; themeId: string }
| { type: "appearance.upsertCustomTheme"; theme: ThemeDefinition }
| { type: "appearance.deleteCustomTheme"; themeId: string }
```

Assert bundled IDs can be activated, unknown IDs fail, deleting the active custom theme switches to Oxide Ledger, bundled themes cannot be overwritten or deleted, and custom names need not be unique because IDs are authoritative.

- [ ] **Step 2: Implement appearance commands**

Validate complete themes before persistence. Mark appearance commands as non-undoable because the settings UI supplies explicit reset and because repeated live editing would pollute the note undo stack.

- [ ] **Step 3: Write failing theme-file tests**

Assert export strips internal `id`, writes the exact versioned external shape, sanitizes the suggested file name to lowercase kebab case, and uses `.kopper-theme.json`. Assert import returns a preview object with a newly generated ID but does not call `CommandService.execute`.

- [ ] **Step 4: Implement `ThemeFiles`**

Expose:

```ts
class ThemeFiles {
  importForPreview(): Promise<Result<ThemeDefinition | null, KopperError>>;
  exportTheme(theme: ThemeDefinition): Promise<Result<{ path: string } | null, KopperError>>;
}
```

A `null` success means the native dialog was cancelled. Read files as UTF-8 with a 256 KiB size ceiling. Parse JSON, validate schema, derive lifecycle tokens, validate readability, then assign `crypto.randomUUID()` only after all checks pass.

- [ ] **Step 5: Extend typed IPC and preload**

Add theme import/export methods. Subscribe to `nativeTheme.on("updated")` in the main process and publish `nativeTheme.shouldUseDarkColors` over a dedicated channel. The renderer cannot access Electron `nativeTheme` directly.

- [ ] **Step 6: Run persistence and bridge tests**

Run:

```bash
pnpm vitest run src/shared/domain/commands.test.ts src/main/theme src/shared/ipc src/main/ipc
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit appearance persistence**

```bash
git add src/shared/domain src/main/theme src/shared/ipc src/main/ipc src/preload
 git commit -m "feat: persist and exchange custom themes"
```

## Task 3: Apply Themes and System Appearance Safely

**Files:**

- Create: `src/renderer/src/theme/applyTheme.test.ts`
- Create: `src/renderer/src/theme/applyTheme.ts`
- Create: `src/renderer/src/theme/ThemeProvider.test.tsx`
- Create: `src/renderer/src/theme/ThemeProvider.tsx`
- Modify: `src/renderer/src/styles/globals.css`
- Modify: `src/renderer/src/main.tsx`
- Modify: `src/renderer/src/app/App.tsx`

**Interfaces:**

- Consumes: active theme ID, appearance mode, bundled/custom themes, and native dark-mode events.
- Produces: `applyTheme(root, tokens)`, `ThemeProvider`, and `useTheme()` with resolved appearance and preview controls.

- [ ] **Step 1: Write failing DOM application tests**

Assert `applyTheme` sets only canonical properties such as `--background`, removes stale canonical values before applying the next theme, never sets unknown keys, sets `--radius`, and returns a cleanup function restoring prior inline values.

- [ ] **Step 2: Implement safe CSS variable application**

Map explicit token names to explicit CSS property names. Never interpolate an imported object key into `style.setProperty`. Apply values to `document.documentElement` in one animation frame.

- [ ] **Step 3: Write failing provider tests**

Test light, dark, and system resolution; native appearance changes; missing active custom theme fallback to Oxide Ledger; temporary preview without persistence; cancel preview restoring persisted tokens; and accepted preview sending `appearance.upsertCustomTheme` followed by `appearance.setActiveTheme`.

- [ ] **Step 4: Implement `ThemeProvider`**

Expose:

```ts
interface ThemeContextValue {
  resolvedMode: "light" | "dark";
  activeTheme: ThemeDefinition;
  previewTheme(theme: ThemeDefinition): void;
  cancelPreview(): void;
  savePreview(theme: ThemeDefinition): Promise<boolean>;
}
```

Apply `.dark` on the root for dark mode so shadcn state selectors remain compatible. Keep previews in renderer memory only.

- [ ] **Step 5: Remove hard-coded palette declarations from global CSS**

Keep layout, typography, focus, Reduced Motion, and translucent-material rules in `globals.css`. Move every color and radius value into `OXIDE_LEDGER_THEME`. Add a test that scans renderer TSX/CSS files and fails on six-digit hex literals outside `src/shared/theme/presets.ts` and test fixtures.

- [ ] **Step 6: Run provider and regression tests**

Run:

```bash
pnpm vitest run src/renderer/src/theme src/shared/theme
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 7: Commit theme application**

```bash
git add src/renderer/src/theme src/renderer/src/styles src/renderer/src/main.tsx src/renderer/src/app/App.tsx
 git commit -m "feat: apply semantic themes at runtime"
```

## Task 4: Build Appearance Settings and the Live Theme Editor

**Files:**

- Create: `src/renderer/src/features/settings/AppearanceSettings.test.tsx`
- Create: `src/renderer/src/features/settings/AppearanceSettings.tsx`
- Create: `src/renderer/src/features/settings/ThemeEditor.test.tsx`
- Create: `src/renderer/src/features/settings/ThemeEditor.tsx`
- Create: `src/renderer/src/features/settings/ThemeImportDialog.test.tsx`
- Create: `src/renderer/src/features/settings/ThemeImportDialog.tsx`
- Modify: `src/renderer/src/app/App.tsx`

**Interfaces:**

- Consumes: `useTheme`, appearance commands, `window.kopper.importTheme`, and `window.kopper.exportTheme`.
- Produces: complete user-facing mode, preset, editor, reset, import-preview, save, and export flows.

- [ ] **Step 1: Write failing appearance-settings tests**

Assert System/Light/Dark controls send `appearance.setMode`, presets render by name, activating a preset sends `appearance.setActiveTheme`, exporting uses the selected theme ID, and controls announce the currently resolved mode.

- [ ] **Step 2: Implement appearance and preset controls**

Use shadcn `Tabs`, `Select`, and `Sheet`:

```bash
pnpm dlx shadcn@latest add tabs select sheet
```

Open settings in a sheet from the panel menu. Preserve keyboard focus on close.

- [ ] **Step 3: Write failing editor tests**

Test mode-specific token editing, immediate preview, 150 ms debounced text validation, per-token reset, Reset all, unsaved-change confirmation, inaccessible contrast blocking Save, valid custom theme save, and radius values at 0rem and 2rem boundaries.

- [ ] **Step 4: Implement the theme editor**

Group tokens into Surface, Text, Action, State, Border, and Shape sections. Each color row contains a native color input when the value converts to hex plus a text field preserving the exact supported CSS color. Show contrast failures beside both involved tokens. Reset token reads from the base preset; Reset all restores the complete base preset in preview memory.

- [ ] **Step 5: Write failing import-preview tests**

Assert cancelled import changes nothing, invalid import displays its structured error, valid import opens a preview dialog, Preview applies without persistence, Cancel restores the active theme, Save persists and activates, and Export becomes available after save.

- [ ] **Step 6: Implement import and export UX**

The preview dialog shows theme name, light/dark swatches, measured contrast status, and missing lifecycle tokens that were derived. Saving an imported theme uses its generated ID; importing the same file twice creates two separately editable custom themes.

- [ ] **Step 7: Run full theme verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit theme settings**

```bash
git add src/renderer/src/features/settings src/renderer/src/app package.json pnpm-lock.yaml
 git commit -m "feat: add customizable shadcn themes"
```

## Milestone Acceptance

Run:

```bash
pnpm test && pnpm typecheck && pnpm build && pnpm test:e2e
```

Then verify that every visible surface responds to Oxide Ledger light/dark, both bundled presets, a hand-edited custom theme, and a re-imported exported theme. Switching System appearance must update without relaunch, invalid contrast must block save, and canceling a preview must restore the persisted theme exactly.
