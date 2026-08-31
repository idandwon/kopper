# Kopper Shadcn Default Theme Design

**Date:** 2026-08-31

**Status:** Approved in design review; awaiting written-spec review

## 1. Purpose

Kopper will replace its three branded bundled themes with one canonical `Default` theme based on the official shadcn New York Neutral light and dark variables. Custom themes remain fully supported.

The change removes Kopper's bundled color language without altering shadcn primitives, feature behavior, persisted notes, or custom-theme workflows.

## 2. Current Problem

`components.json` already declares the intended shadcn configuration:

- style: `new-york`
- base color: `neutral`
- CSS variables: enabled

The rendered application does not use those default colors because `ThemeProvider` applies one of three custom bundled definitions at runtime:

- Oxide Ledger
- Night Workshop
- Index Drawer

Those definitions overwrite the semantic variables consumed by the shadcn components. The primitives are not the cause of the visual mismatch and must remain unchanged.

## 3. Chosen Approach

Introduce one canonical bundled theme:

- ID: `builtin:shadcn-default`
- Name: `Default`
- Light and dark values: the official shadcn New York Neutral semantic theme values

`BUNDLED_THEMES` will expose only this theme. The former bundled IDs remain accepted as internal compatibility aliases that resolve to `Default`; they are not shown as separate themes.

This approach gives new and existing users one honest built-in choice, preserves stored documents, and avoids duplicated or misleading theme rows.

## 4. Theme Values

The canonical theme uses the semantic values generated for shadcn New York with the Neutral base color. Values are stored as OKLCH strings, matching current shadcn output.

### 4.1 Light

| Token | Value |
| --- | --- |
| `background` | `oklch(1 0 0)` |
| `foreground` | `oklch(0.145 0 0)` |
| `card` | `oklch(1 0 0)` |
| `card-foreground` | `oklch(0.145 0 0)` |
| `popover` | `oklch(1 0 0)` |
| `popover-foreground` | `oklch(0.145 0 0)` |
| `primary` | `oklch(0.205 0 0)` |
| `primary-foreground` | `oklch(0.985 0 0)` |
| `secondary` | `oklch(0.97 0 0)` |
| `secondary-foreground` | `oklch(0.205 0 0)` |
| `muted` | `oklch(0.97 0 0)` |
| `muted-foreground` | `oklch(0.556 0 0)` |
| `accent` | `oklch(0.97 0 0)` |
| `accent-foreground` | `oklch(0.205 0 0)` |
| `destructive` | `oklch(0.577 0.245 27.325)` |
| `border` | `oklch(0.922 0 0)` |
| `input` | `oklch(0.922 0 0)` |
| `ring` | `oklch(0.708 0 0)` |
| `radius` | `0.625rem` |

### 4.2 Dark

| Token | Value |
| --- | --- |
| `background` | `oklch(0.145 0 0)` |
| `foreground` | `oklch(0.985 0 0)` |
| `card` | `oklch(0.205 0 0)` |
| `card-foreground` | `oklch(0.985 0 0)` |
| `popover` | `oklch(0.205 0 0)` |
| `popover-foreground` | `oklch(0.985 0 0)` |
| `primary` | `oklch(0.922 0 0)` |
| `primary-foreground` | `oklch(0.205 0 0)` |
| `secondary` | `oklch(0.269 0 0)` |
| `secondary-foreground` | `oklch(0.985 0 0)` |
| `muted` | `oklch(0.269 0 0)` |
| `muted-foreground` | `oklch(0.708 0 0)` |
| `accent` | `oklch(0.269 0 0)` |
| `accent-foreground` | `oklch(0.985 0 0)` |
| `destructive` | `oklch(0.704 0.191 22.216)` |
| `border` | `oklch(1 0 0 / 10%)` |
| `input` | `oklch(1 0 0 / 15%)` |
| `ring` | `oklch(0.556 0 0)` |
| `radius` | `0.625rem` |

Kopper's existing theme contract also requires `destructive-foreground`; the canonical definition uses the shadcn high-contrast foreground value `oklch(0.985 0 0)`. Existing derived lifecycle compatibility values continue to come from core semantic tokens and are not exposed as a second visual language.

The authoritative upstream references are the [shadcn theming documentation](https://ui.shadcn.com/docs/theming) and the repository's official New York Neutral registry output.

## 5. Compatibility and Data Flow

### 5.1 New documents

`createEmptyDocument` stores `builtin:shadcn-default` as the active theme ID. Appearance mode remains `system`.

### 5.2 Existing bundled-theme documents

The following legacy IDs resolve to the canonical `Default` definition:

- `builtin:oxide-ledger`
- `builtin:night-workshop`
- `builtin:index-drawer`

Resolution happens at the bundled-theme boundary. It does not mutate the persisted document merely because the application opened it and does not require a document schema version change.

Settings treats a resolved legacy ID as `Default` being active. Selecting `Default`, or another later acknowledged appearance mutation, stores the canonical ID through the existing command path.

### 5.3 Existing custom-theme documents

If `appearance.activeThemeId` refers to an existing custom theme, that theme remains active. Custom definitions, imports, exports, previews, edits, deletions, undo behavior, and validation remain unchanged.

If an active custom theme is deleted, the canonical `Default` theme becomes active.

### 5.4 Missing themes

An unresolved theme ID falls back to `Default`, matching the current defensive behavior but using the new canonical theme.

## 6. Appearance Settings UX

The Appearance section displays themes in this order:

1. `Default`
2. Custom themes in their existing stored order

The built-in theme remains read-only. Its Actions menu offers `Customize` and `Export`; Customize creates a custom copy through the existing editor flow. Custom themes retain `Edit`, `Export`, and `Delete`.

The current mode selector, activation feedback, confirmation behavior, accessibility semantics, and keyboard behavior remain unchanged. User-facing deletion copy refers to `Default`, not Oxide Ledger.

No duplicate legacy rows, IDs, compatibility labels, migration notices, badges, or new controls are introduced.

## 7. Design-System Boundary

The theme migration must remain within the existing shadcn/Tailwind system:

- All files in `src/renderer/src/components/ui/` remain byte-for-byte unchanged.
- Feature components compose the existing primitive APIs and variants.
- Colors use the existing semantic variables such as `background`, `foreground`, `card`, `primary`, `muted`, `accent`, `destructive`, `border`, `input`, and `ring`.
- Layout uses the existing Tailwind scale and component defaults.
- No arbitrary pixel values, raw feature colors, custom radii, one-off control heights, bespoke borders, shadows, or focus styles are added.
- System, light, dark, hover, selected, disabled, destructive, and focus states continue to come from semantic variables and primitive variants.
- The translucent macOS shell remains the existing platform-level exception; this change does not add or restyle shell effects.

This pass changes theme definitions and theme-resolution composition only. It does not redesign unrelated feature layouts.

## 8. Internal Interfaces

- Replace `OXIDE_LEDGER_THEME` with `SHADCN_DEFAULT_THEME` as the canonical exported fallback.
- Replace the three-entry `BUNDLED_THEMES` array with `[SHADCN_DEFAULT_THEME]`.
- Add an internal legacy bundled-ID resolver or predicate shared by theme resolution and active-state presentation.
- Update document creation and custom-theme deletion fallback to use the canonical ID.
- Keep `ThemeDefinition`, theme-file version 1, persisted document schema version 1, renderer bridge APIs, and IPC channels unchanged.
- Keep custom-theme validation and canonical export behavior unchanged.

## 9. Error Handling

- A missing or legacy bundled ID resolves safely to `Default` without displaying an error.
- Failed user-triggered appearance mutations retain their existing acknowledged error feedback.
- Custom-theme import, validation, preview, save, and deletion errors retain their existing behavior.
- No persistence success is claimed before the existing command acknowledgement.

## 10. Testing and Verification

### 10.1 Theme tests

- Assert every canonical light and dark semantic value exactly.
- Assert `BUNDLED_THEMES` contains only `Default`.
- Assert each legacy bundled ID resolves to the same canonical definition.
- Assert a custom active theme still wins over the fallback.
- Assert an unknown ID falls back to `Default` in `ThemeProvider`.

### 10.2 Domain tests

- Assert new documents use `builtin:shadcn-default`.
- Assert selecting the bundled default succeeds.
- Assert deleting an active custom theme selects `Default`.
- Retain schema-version and custom-theme validation coverage.

### 10.3 Settings tests

- Assert one bundled `Default` row is shown and no legacy names are rendered.
- Assert legacy active IDs present `Default` as active.
- Assert custom theme activation, customization, edit, import, export, and delete remain available.
- Assert deletion copy names `Default` as the fallback.

### 10.4 Design-system audit

- Record the pre-change checksums of `src/renderer/src/components/ui/` and compare them after implementation.
- Review the feature diff for raw colors, arbitrary geometry, primitive styling overrides, and new one-off CSS.
- Inspect light and dark Notes and Appearance Settings at `340x480` and `380x640`.

### 10.5 Verification commands

- Focused Vitest suites for presets, document commands, `ThemeProvider`, and Appearance Settings.
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `env -u ELECTRON_RUN_AS_NODE pnpm test:e2e`

## 11. Non-goals

- Removing custom themes.
- Changing custom-theme file or persisted document schemas.
- Editing or regenerating shadcn primitives.
- Introducing a new component library, icon set, font, theme dependency, or CSS framework.
- Restyling unrelated renderer surfaces.
- Changing the macOS shell, capture behavior, notes, shortcuts, window lifecycle, packaging, installer, version, or release workflow.

## 12. Acceptance Criteria

The change is complete when:

1. A clean document renders the official shadcn New York Neutral theme in system, light, and dark modes.
2. Existing documents using any former bundled theme render `Default` with a coherent active state.
3. Existing active custom themes remain active and every custom-theme workflow still works.
4. Appearance Settings contains only `Default` plus user-created custom themes.
5. No shadcn primitive file changed.
6. No bespoke visual token or arbitrary geometry was introduced.
7. Automated tests, type checking, build, E2E, and targeted visual inspection pass.
