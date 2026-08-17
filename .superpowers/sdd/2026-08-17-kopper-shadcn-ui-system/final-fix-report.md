# Final fix report — Task 8

## Status

**DONE_WITH_CONCERNS.** All five Important and two Minor review findings are fixed and the exact source commit passes the complete automated gate. The only residual evidence boundary is that Playwright cannot click the real macOS status item: the live Electron journey exercises the fixed main-process `webContents` event, while the WindowManager unit test exercises the actual status-menu callback, panel show/focus, and event send. No production test authority was added to bridge that boundary.

## Exact source identity

- Reviewed starting head: `21488da6869cd9967cf68b9067b032239f9798bf`
- Source commit: `f22d485da218a47e1574fd281ffacf26e246e498`
- Source tree: `92e85fb878d9cc05d1ef45c6f1f9d66d2af10916`
- Source commit message: `fix: close shadcn UI review findings`
- No package, dependency, preload, IPC contract, security-policy, or production main-process file changed.

## RED / GREEN evidence

### Focused unit/component RED

Command, run before production edits:

```bash
pnpm vitest run \
  src/renderer/src/app/DocumentPanel.theme-preview.test.tsx \
  src/renderer/src/features/settings/SettingsPage.test.tsx \
  src/renderer/src/features/settings/SettingsPage.shortcuts.test.tsx \
  src/renderer/src/features/settings/ThemeEditor.test.tsx \
  src/renderer/src/features/settings/ThemeImportDialog.test.tsx \
  src/renderer/src/theme/ThemeProvider.test.tsx \
  src/renderer/src/features/sections/SectionGroup.test.tsx \
  src/renderer/src/features/notes/NoteCard.test.tsx \
  src/renderer/src/features/feedback/PanelFeedback.test.tsx \
  src/main/window/windowManager.test.ts
```

Exact summary: **9 failed files, 1 passed; 10 failed tests, 63 passed (73 total)**.

Observed failures included:

- native forced routing left `#123456` active instead of persisted `#173D35` for both editor and import previews;
- editor/import unmount called `cancelPreview` zero times;
- an old owner cancellation cleared the newer theme;
- first Escape closed both the real Radix Select and Settings;
- the shortcut candidate reverted from `Command+Alt+U` to `CommandOrControl+Shift+Space`;
- the long heading lacked its shrinking/wrapping classes;
- completed hover token classes were absent; and
- the initial Escape-driven Radix feedback-dismiss test exposed two zero-delay Radix housekeeping timers. The final test uses Radix's swipe-dismiss behavior path and proves immediate zero timers, then runs all timers to prove no later work.

### Focused Electron RED / baseline

Command, run before production edits:

```bash
pnpm playwright test tests/e2e/document-workflows.spec.ts \
  tests/e2e/native-surfaces.spec.ts \
  --grep "long spaced|fixed live|actual focusless"
```

Exact summary: **2 failed, 1 passed**.

- Long section containment failed with a measured right edge of **889.84375 px** in a 340 px viewport.
- The fixed live Settings event journey passed on its first execution; this was an evidence gap, not a newly discovered runtime defect.
- The first HUD journey used an invalid accessible-name expectation for `role=status` and failed to locate the already-created status element. It was corrected to assert status text without changing production. The resulting journey then measured the actual detached window and renderer.

### Focused GREEN

```text
Focused unit/component: 10 files passed, 73 tests passed.
Focused Electron: 3 tests passed in 4.9s.
Long-name Electron rerun: 1 test passed in 1.5s.
```

## Finding-by-finding disposition

### Important 1 — Forced route and theme-preview ownership

**Fix:** Theme previews now carry an opaque owner token. Preview cancellation clears only the current matching owner, while successful save still clears only the exact saving preview wrapper. `ThemeEditor` and `ThemeImportDialog` release their owner on unmount, so forced native navigation restores the persisted theme. Normal upsert failure and activation failure remain open with their preview intact for retry. A native focus request refocuses Back after Radix modal teardown while routing to Shortcuts.

The defined native-route behavior is: native Settings has routing priority, closes the Appearance modal by unmounting it, releases that modal's unpersisted preview, opens Shortcuts, and focuses Back. A completed acknowledged save remains governed by the existing persistence-first two-step save.

**Files:**

- `src/renderer/src/theme/ThemeProvider.tsx`
- `src/renderer/src/features/settings/ThemeEditor.tsx`
- `src/renderer/src/features/settings/ThemeImportDialog.tsx`
- `src/renderer/src/app/DocumentPanel.tsx`
- `src/renderer/src/features/settings/SettingsPage.tsx`
- `src/renderer/src/app/DocumentPanel.theme-preview.test.tsx`
- `src/renderer/src/theme/ThemeProvider.test.tsx`
- `src/renderer/src/features/settings/ThemeEditor.test.tsx`
- `src/renderer/src/features/settings/ThemeImportDialog.test.tsx`

### Important 2 — Escape ownership with real Radix Select

**Fix:** The route listener now returns for `event.defaultPrevented` and defensively recognizes listbox/option ownership. The component test uses the real shared Radix Select: first Escape closes only the listbox; the later unowned Escape closes Settings. Existing App and Electron tests prove Search/menu focus restoration.

**Files:**

- `src/renderer/src/features/settings/SettingsPage.tsx`
- `src/renderer/src/features/settings/SettingsPage.test.tsx`

### Important 3 — Long section names

**Fix:** Section headings have a real `min-w-0` shrinking seam and intentionally wrap with `break-all`. Move destinations use a viewport-capped 13 rem submenu with explicit ellipsis labels. Shared Select trigger/value/item seams now shrink and ellipsize; delete destination uses the full available width and preserves the complete title as `title` text.

A real 340×480 Electron test covers long spaced and unbroken names in headings, Move to submenu items, delete Select options, and selected value. It also reruns full surface containment with no horizontal overflow.

**Files:**

- `src/renderer/src/features/sections/SectionGroup.tsx`
- `src/renderer/src/features/sections/SectionManager.tsx`
- `src/renderer/src/features/notes/NoteContextMenu.tsx`
- `src/renderer/src/components/ui/context-menu.tsx`
- `src/renderer/src/components/ui/select.tsx`
- `src/renderer/src/features/sections/SectionGroup.test.tsx`
- `tests/e2e/document-workflows.spec.ts`

### Important 4 — Shortcut candidate tab retention

**Fix:** Only Shortcuts is force-mounted. It receives an explicit active state and is hidden while inactive; Appearance and Data retain normal unmount behavior. The local candidate survives tab navigation. A layout-effect lifecycle removes the global recorder immediately when inactive, stops recording, and clears stale recording instructions. A behavior test sends a shortcut while hidden and proves it is not recorded.

**Files:**

- `src/renderer/src/features/settings/SettingsPage.tsx`
- `src/renderer/src/features/settings/ShortcutSettings.tsx`
- `src/renderer/src/features/settings/SettingsPage.shortcuts.test.tsx`
- `src/renderer/src/features/settings/ShortcutSettings.test.tsx`

### Important 5 — Native Settings and detached HUD Electron evidence

**Fix/evidence:** Added two live Electron journeys.

1. The fixed main-process `kopper:settings:open` `webContents` event opens Shortcuts, focuses Back, and restores Search focus on return.
2. The existing `window.kopper.requestCapture()` path, with the existing Electron permission test seam set to denied and the panel hidden, creates the actual detached HUD. The journey proves exact 340×72 BrowserWindow bounds anchored to the hidden panel, `focusable=false`, not focused, visible while active, hidden after 1800 ms, main panel still hidden/unfocused, exact 340×72 renderer geometry, zero document scroll, and contained status bounds.

The WindowManager status-template unit test now clicks **Settings…** and proves panel `show()`, `focus()`, callback invocation, and the fixed `webContents.send` channel together.

**Files:**

- `tests/e2e/native-surfaces.spec.ts`
- `src/main/window/windowManager.test.ts`

**Evidence boundary:** Playwright/Electron does not expose an automatable click for the real macOS status item. The test therefore does not claim a physical status-item click. No IPC, preload method, global, production hook, or tolerance was added to fake one.

### Minor 1 — Completed lifecycle hover token

**Fix:** Completed markers explicitly retain `--completed` for normal and dark hover; regression coverage asserts all three semantic classes.

**Files:**

- `src/renderer/src/features/notes/NoteCard.tsx`
- `src/renderer/src/features/notes/NoteCard.test.tsx`

### Minor 2 — PanelFeedback cleanup evidence

**Fix/evidence:** Fake-timer tests now prove provider unmount leaves zero timers and no later work. A real Radix swipe-dismiss path invokes `onOpenChange(false)`, leaves zero timers immediately, and remains inert after all timers are run. Production `PanelFeedback` required no change.

**File:** `src/renderer/src/features/feedback/PanelFeedback.test.tsx`

## Exact-source full validation

All commands below ran at source `f22d485da218a47e1574fd281ffacf26e246e498` / tree `92e85fb878d9cc05d1ef45c6f1f9d66d2af10916`:

| Command | Result |
| --- | --- |
| `pnpm test` | PASS — 69 files, 758 tests; 6.74s. |
| `pnpm typecheck` | PASS — `tsc -b --pretty false`, no diagnostics. |
| `pnpm build` | PASS — main 38 modules / 147.40 kB; preload 240 modules / 256.93 kB; renderer 680 modules / CSS 50.47 kB / JS 1,877.87 kB. The only noise was the already-characterized 38 dependency-level Rollup `"use client"` warnings. |
| `pnpm test:e2e` | PASS — 15/15, one worker, 23.4s; no failed/retried/skipped tests. |
| `pnpm audit:source` | PASS — `{ "ok": true, "source": "src", "checks": { "files": 102 }, "failures": [] }`. |
| `git diff --check 09057d8..HEAD` | PASS — no output. |

Generated `test-results/` was removed after the final run. Final pre-report source status was clean.

## Screenshots

No screenshot file changed. The four deterministic screenshot journeys reran as part of the 15-test Electron suite and matched all eight existing native-size Light/Dark notes/Settings baselines at 380×640 and 340×480. No mask, tolerance, or baseline was changed; therefore there was no changed image requiring an update or separate native-resolution inspection.

## Security, authority, and residual risk

- No production IPC/preload surface, dependency, remote content, test backdoor, or main-process authority was added.
- Theme 4.5:1 validation, opaque-background validation, two-step save/activation, and failure retry behavior remain unchanged.
- Repository-authoritative note, section, shortcut, pin, document, and capture behavior remains persistence-first.
- Exactly one visible panel owner remains; only the Shortcuts form is mounted hidden, and its global recorder is inactive.
- The sole residual concern is the honest macOS status-item automation boundary described under Important 5. All code on either side of that native click is covered, but no physical status-item click is claimed.
