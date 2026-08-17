# Kopper Shadcn UI System and Overflow Design

**Date:** 2026-08-17

**Status:** Approved in design review; awaiting written-spec review

## 1. Purpose

Kopper will standardize its interaction surfaces on shadcn/Radix primitives while preserving the original Oxide Ledger identity and the proven Copper-inspired hierarchy of the main panel.

This pass also replaces the cramped Settings drawer with a full-panel Settings page and establishes a testable overflow contract for every renderer surface.

The goal is consistency, accessibility, and resilience at the minimum supported window sizes. It is not a generic shadcn restyle and does not copy Copper branding or unsupported Copper behavior.

## 2. Product Direction

### 2.1 Subject and audience

Kopper is a compact macOS capture ledger for people who collect prompts, fragments, and working notes without leaving their current application.

The main panel has one job: keep captured material immediately available without becoming a full workspace. Secondary surfaces must support that job without crowding the panel.

### 2.2 Reference boundary

The inspected Copper reference visibly demonstrates:

- a narrow floating panel;
- search plus one overflow control;
- uppercase section labels and divider rules;
- rounded note cards and circular lifecycle controls;
- a bottom card-shaped composer;
- strong selection outlines;
- translucent context menus with shortcut labels; and
- a detached capture acknowledgement near the source workflow.

The reference does not demonstrate Settings, onboarding, recovery, theme editing, Active/Completed navigation, or expanded editing. Those surfaces remain original Kopper designs.

### 2.3 Chosen approach

Use a **shadcn-first surface audit**:

- shadcn primitives own common interaction behavior and visual states;
- Kopper feature components own product-specific composition and semantics;
- Oxide Ledger tokens continue to define color, radius, and lifecycle meaning;
- every renderer route is audited at its minimum size; and
- no generalized wrapper framework is introduced unless multiple real consumers require the same interface.

## 3. Goals

1. Make controls, forms, overlays, focus states, validation, and feedback visually and behaviorally consistent.
2. Replace raw controls where a suitable shadcn primitive exists.
3. Preserve Kopper-specific note, capture, composer, lifecycle, and panel structures.
4. Replace the Settings drawer with a full-panel Settings page.
5. Prevent document-level and nested accidental scrolling.
6. Prove layout containment at default and minimum window sizes in Light and Dark modes.
7. Preserve persistence-first mutations, secure Electron boundaries, keyboard workflows, and reduced-motion behavior.

## 4. Non-goals

- Copying Copper's name, logo, exact palette, typography, marketing copy, or ornamental details.
- Replacing every JSX element with a wrapper for its own sake.
- Converting semantic content containers into shadcn cards when a card does not express a real hierarchy.
- Creating a dedicated Settings BrowserWindow.
- Removing or changing Pin/Unpin behavior.
- Making the panel permanently always-on-top.
- Changing capture text representation, Markdown contracts, storage, IPC privileges, or release policy.
- Adding remote assets, external fonts, analytics, updates, or arbitrary links.

## 5. Visual System

### 5.1 Oxide Ledger reference palette

The existing semantic theme system remains authoritative. The built-in Oxide Ledger reference values are:

| Role | Value |
| --- | --- |
| Ledger green | `#173D35` |
| Paper | `#F6F9F6` |
| Raised paper | `#FFFFFF` |
| Oxidized copper | `#B86138` |
| Verdigris | `#2E8775` |
| Rule | `#C7D9D5` |

Custom themes continue to supply the same semantic token contract. Components must consume semantic tokens rather than hard-coded reference colors.

### 5.2 Typography

- Interface and body: the existing macOS system stack, led by SF Pro Text.
- Commands and compact data: SF Mono through the existing monospace token.
- No external or bundled display font is introduced.

The native typography is deliberate: Kopper is a compact macOS utility, not a marketing page.

### 5.3 Signature

The copper-to-verdigris lifecycle spine remains Kopper's principal signature. Lifecycle circles, capture highlighting, and ledger rules may echo that geometry.

Shadcn must govern interaction consistency without replacing this signature with default dashboard styling.

### 5.4 Restraint

Avoid the generic pattern of placing every settings group in a raised rounded card. Settings use hierarchy, separators, labels, and whitespace. Raised surfaces are reserved for controls or content that genuinely sit above their parent material.

## 6. Main Panel

The main panel retains its established hierarchy:

```text
┌──────────────────────────────────┐
│  Search notes                 ⋯  │
│  [ Active ] [ Completed ]        │
├──────────────────────────────────┤
│  SECTION TITLE              3    │
│  ┌────────────────────────────┐  │
│  │ Note content              │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌ Capture • Add a note   Add ┐  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

The panel shell, lifecycle rail, note cards, composer arrangement, Markdown rendering, selection states, capture highlight, and completion choreography remain feature-owned components.

The resting command surface remains sparse. Search and overflow are primary; lifecycle switching stays visually quiet.

## 7. Settings as a Full-panel Page

### 7.1 Layout

Settings replaces the note page inside the existing panel shell:

```text
┌ ← Settings                     ┐
│ Shortcuts  Appearance  Data     │
├─────────────────────────────────┤
│                                 │
│ One vertically scrollable       │
│ settings category               │
│                                 │
└─────────────────────────────────┘
```

There is no drawer, sheet, separate BrowserWindow, or split navigation column.

Horizontal tabs avoid recreating the drawer's width problem at 340 pixels. The header and tab list remain fixed; only the active tab body scrolls.

### 7.2 Route model

The panel uses a discriminated renderer route:

- `{ page: "notes" }`
- `{ page: "settings", tab: "shortcuts" | "appearance" | "data" }`

`DocumentPanel`, or a focused navigation module directly owned by it, controls this route. `PanelMenu` no longer owns Settings lifecycle.

### 7.3 Entry points

- Panel overflow **Settings…** opens the Appearance tab.
- Native status-menu **Settings…** shows and focuses the panel, then opens the Shortcuts tab through the existing validated preload event.
- Back returns to the previous notes page.

### 7.4 Preserved state

Returning from Settings preserves:

- search query;
- Active/Completed view;
- selection where still valid;
- authoritative document state; and
- persisted composer draft.

Capture and document publications continue while Settings is visible. Returning to notes projects the latest acknowledged document.

### 7.5 Focus and keyboard behavior

- Entering Settings focuses its heading or Back control without scrolling content.
- Back restores focus to the panel-menu trigger when that trigger opened Settings.
- When Settings was opened from the native status menu, Back returns to notes and focuses the Search notes field.
- `Escape` returns to notes only when no dialog, menu, editable field, or other focused owner consumes it.
- Reduced-motion mode removes page-transition animation.

## 8. Shadcn Component Contract

### 8.1 Existing authoritative primitives

Continue using and normalize:

- `AlertDialog`
- `Button`
- `ContextMenu`
- `Dialog`
- `DropdownMenu`
- `Input`
- `ScrollArea`
- `Select`
- `Tabs`

The Settings migration removes the only intended `Sheet` consumer. The obsolete sheet implementation should be removed if no consumer remains.

### 8.2 New primitives

Add focused local shadcn implementations for:

- `Label`
- `Separator`
- `Textarea`
- `ToggleGroup`
- `Tooltip`
- a toast/status primitive suitable for acknowledged panel operations

Generic symbols may use one consistent Lucide set. Kopper-specific lifecycle circles, rail, capture mark, and brand iconography remain original.

### 8.3 Required conversions

- Composer and Markdown editor use `Textarea`.
- Standard field labels use `Label`.
- Active/Completed uses `ToggleGroup` with explicit accessible single-selection semantics.
- Settings category divisions use `Separator`.
- Icon-only controls receive `Tooltip` where their accessible name is not visually apparent.
- Raw section moves use `Select`.
- Discard confirmation uses `AlertDialog`, not `globalThis.confirm`.
- Standard color fields may use shadcn `Input` with `type="color"`; native color-picker behavior remains browser-provided.
- Shortcut recording may retain specialized keyboard handling, but its field surface and states use the shared input contract.
- Generic operation feedback uses the shared status/toast contract with accessible live-region behavior.

### 8.4 Feature-owned components

These remain custom because they encode product behavior rather than generic control behavior:

- `PanelShell`
- `NoteCard`
- `NoteComposer` composition
- note presentation and lifecycle transitions
- Markdown rendering
- capture HUD
- recovery and onboarding compositions

They may consume shadcn primitives internally.

## 9. Interaction and Feedback

- Actions and resulting feedback use the same vocabulary: “Panel pinned,” “Theme exported,” and “Notes copied.”
- Errors identify the failed operation and, where possible, the next corrective action.
- Destructive actions name the destructive verb in `AlertDialog`.
- Disabled, pending, invalid, focused, selected, captured, and completed states remain visually distinguishable without color alone.
- Mutations remain repository-authoritative. No visual success precedes persistence acknowledgement.
- Settings tab changes do not discard in-progress values contrary to each existing settings workflow.

## 10. Overflow Contract

### 10.1 Supported viewport evidence

Audit at least:

| Surface | Default | Minimum |
| --- | --- | --- |
| Main panel | `380×640` | `340×480` |
| Full-panel Settings | `380×640` | `340×480` |
| Expanded editor | existing default | `420×480` |
| Capture HUD | configured HUD bounds | same fixed bounds |

Dialogs, menus, onboarding, and recovery must also remain contained within their owning supported viewport.

### 10.2 One scroll owner

Each visible surface has one deliberate primary scroll owner:

- Notes page: note collection.
- Settings page: active tab body.
- Expanded editor: editor content.
- Dialog: bounded dialog content only when its contents exceed the viewport.
- Capture HUD: no scroll owner; overflow is forbidden.

The document body must not become an accidental competing scroll container.

### 10.3 Containment rules

- Flex and grid children that may shrink use `min-w-0` and, where relevant, `min-h-0`.
- Standard fields use available width rather than arbitrary minimum trigger widths.
- Long paths, errors, shortcut labels, section names, note text, and imported theme names wrap or clamp intentionally.
- Portal content is capped to the available viewport and uses collision handling.
- Fixed headers, tabs, and composer surfaces never overlap the active scroll region.
- No horizontal scrollbar is accepted at supported sizes.
- Nested vertical scroll areas require a documented interaction need; convenience nesting is not accepted.

## 11. Surface Audit

The pass covers every renderer surface:

1. Main note panel.
2. Full-panel Settings and all three tabs.
3. Expanded editor window.
4. Onboarding.
5. Recovery.
6. Add-section, theme, import, and destructive dialogs.
7. Dropdown, context, and select menus.
8. Capture HUD and panel feedback.
9. Light, Dark, and custom-theme token application.

## 12. Accessibility

- Every control retains an accessible name.
- Icon-only controls have both an accessible name and an appropriate visible tooltip.
- Toggle groups expose pressed/selected state.
- Dialogs trap focus and restore it to the initiating control.
- Full-panel navigation has deterministic focus restoration.
- Errors use `role="alert"`; nonurgent success uses polite status semantics.
- Focus indicators meet the theme's contrast contract and are not conveyed by color alone.
- All workflows remain keyboard-operable.
- VoiceOver can reach full note content even when visual previews are clamped.
- Reduced motion and reduced transparency remain respected.

## 13. Security and Data Integrity

This pass does not widen renderer authority:

- `contextIsolation`, sandboxing, and disabled Node integration remain unchanged.
- No remote renderer content or arbitrary external navigation is introduced.
- Status-menu Settings entry continues through the fixed preload event.
- User data and theme values remain validated at existing boundaries.
- Capture and document publication remain authoritative and nonoptimistic.
- No new account, telemetry, update, or network behavior is introduced.

## 14. Testing Strategy

### 14.1 TDD

Each behavior change begins with a failing focused test. Tests assert user-visible semantics rather than implementation-only wrapper usage where possible.

### 14.2 Unit and component coverage

Cover:

- panel route transitions and entry-tab selection;
- focus restoration and Escape ownership;
- state preservation across Settings navigation;
- each converted primitive's accessible behavior;
- discard `AlertDialog` behavior;
- pin feedback and unchanged persistence semantics;
- long values and pending/error states; and
- capture publication while Settings is visible.

### 14.3 Electron E2E

At minimum and default sizes, assert:

- `scrollWidth <= clientWidth` for each full-page renderer surface;
- no document-level vertical scrolling where an internal owner exists;
- every settings category and action remains keyboard-reachable;
- dialogs and menus stay inside viewport bounds;
- notes state survives a Settings round trip;
- native status-menu Settings entry reaches Shortcuts; and
- expanded editor, onboarding, recovery, and capture feedback remain contained.

### 14.4 Visual regression

Maintain deterministic Light and Dark baselines for:

- notes at `380×640` and `340×480`;
- Settings at `380×640` and `340×480`; and
- any secondary surface whose intentional layout changes cannot be adequately asserted through geometry.

Screenshot evidence must use deterministic documents, themes, viewport sizes, and reduced animation.

### 14.5 Full verification

Run the complete unit suite, typecheck, build, Electron E2E suite, dependency audit, source audit, release-document traceability, and diff hygiene. Unsigned universal packaging must be rerun before associating the changed production source with release evidence.

## 15. Release Impact

This pass changes production renderer source after the currently recorded automated release-evidence SHA. Existing evidence remains historically accurate for its stated source but does not cover the new source.

No release may be promoted until the complete gate is associated with the exact candidate source and all protected and physical acceptance requirements are genuinely completed.

## 16. Acceptance Criteria

1. Settings occupies the complete panel content area and no Settings drawer appears.
2. Panel and status-menu Settings entry points select their specified initial tabs.
3. Back and Escape follow the focus and ownership rules in this specification.
4. Pin/Unpin behavior remains available and persistence-backed.
5. Common controls use the shared shadcn contract unless a documented product-specific interaction requires otherwise.
6. Kopper retains the Oxide Ledger palette, lifecycle spine, cards, capture semantics, and original identity.
7. No renderer surface horizontally overflows at its supported minimum size.
8. Each surface has one deliberate primary scroll owner.
9. Long content, validation, pending states, dialogs, and menus remain contained and accessible.
10. Light and Dark visual baselines cover notes and Settings at default and minimum panel sizes.
11. Full keyboard operation, focus restoration, reduced motion, and live-region feedback pass automated coverage.
12. Existing persistence, capture, security, theme validation, import/export, and release-evidence integrity remain intact.
