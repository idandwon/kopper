# Final whole-branch review — Kopper shadcn UI-system milestone

## Review identity and method

- Range: `2116862642e7698d45455b7308746385589d1fa8..cc7762dfa102deb663509f588e27885f63d2b057`.
- Exact gated source/test commit: `2828fa40f69478a11e5e99f61afe0fd046deeb7d`; tree `2fb3f0279134cc1ced9dadd27f62558435b23a01`.
- The supplied package is complete: its 90 changed paths match Git in order, and its diff body exactly matches `git diff --unified=10` for the declared range.
- Post-source scope is clean: `2c9158a`, `972acd1`, and `cc7762d` change only the two release-evidence documents and the scoped progress ledger. There is no post-`2828fa4` change under `src`, `tests`, package/lock, builder, or Vite inputs.
- I read the approved spec, complete plan, ledger, final review/fix/re-review records, Task 9 report/debug review, full review package, and implicated final source/tests. I inspected all eight native-size baselines. Per instruction, I did not rerun the full/package gate or mutate source, tests, index, or `HEAD`.

## Strengths

- The branch preserves a recognizable Oxide Ledger hierarchy and lifecycle signature without importing Copper branding, palette, typography, or product behavior. The eight Light/Dark notes/Settings images are truthful 380×640 and 340×480 captures with no masks; the existing `0.01` screenshot ratio was not weakened.
- `DocumentPanel` now owns a clear discriminated notes/Settings route. Search, lifecycle view, selection, composer draft, capture publication, and authoritative document projection survive normal Settings round trips; Sheet code and feature-level raw generic controls are gone.
- Shared Radix primitives consistently own generic controls and bounded overlays, while note cards, composer, capture HUD, lifecycle behavior, and Markdown remain product-owned. Added production code uses semantic tokens, natural narrowing, and no new TypeScript assertions.
- Theme preview owner symbols and exact-wrapper save cleanup correctly prevent stale owners or acknowledgements from clearing a newer preview. Theme, note, shortcut, pin, and capture success remain acknowledgement-driven.
- Listener, animation-frame, debounce, capture, and feedback timers have cleanup. The completed lifecycle hover token and both deferred feedback-timer assertions are fixed.
- Security boundaries are unchanged in production: no main/preload/shared/package input changed, renderer authority was not widened, and Electron remains sandboxed with context isolation enabled and Node integration disabled.
- Geometry evidence is materially stronger than class-only checks: it covers root dimensions, visible owner identity, right edges, bounded overlays, editor/onboarding/recovery minimums, long section names, and the real 340×72 HUD.
- Ruling 2 is accepted. The status-item boundary is accurately split between the real `WindowManager` menu callback unit test and a live fixed-event Electron journey; no physical status-item click is claimed.
- Ruling 3 is accepted. `app.hide()` removes host input while Playwright still drives renderer keyboard events and verifies acknowledgement clearing plus DOM focus. It does not claim native activation; native show/focus is covered separately.
- Evidence is honest: SHA/tree/counts agree, the historical failed attempt is separate from the fresh successful interval, protected and physical rows remain `Not run`, and release status remains Incomplete/Blocked.

## Critical issues

None.

## Important issues

### 1. Native Settings routing can leave notes-owned portal overlays visible over Settings

**Files:** `src/renderer/src/app/DocumentPanel.tsx:147-153,201-203`; `src/renderer/src/features/panel/PanelMenu.tsx:40-42,121-123`; `src/renderer/src/features/sections/SectionManager.tsx:106,168-198`; `src/renderer/src/features/notes/NoteContextMenu.tsx:51-53`; `src/renderer/src/features/editor/MarkdownEditor.tsx:161-168`.

The mounted-hidden ruling is sound only if every notes-owned portal is dismissed or unmounted when notes become hidden. The implementation coordinates only `AddSectionDialog`. Rename and delete dialogs, the dirty-editor discard alert, section/panel dropdowns, and note context menus remain mounted under stateful Radix roots; their content is portalled outside the ancestor carrying `hidden`. A native Settings event can therefore hide the notes DOM while a notes-owned dialog/menu and focus trap remain visible above the Shortcuts page. This breaks full-page replacement, deterministic Back focus, and the “one visible surface” accessibility contract.

**Required fix:** introduce one route-visibility/overlay-dismissal contract for all notes-owned portals (without unmounting the state that Settings is intended to preserve), then test the real native listener with rename/delete/discard and menu/context-menu owners open. Ruling 1 is **not fully satisfied by the current implementation** until this portal boundary is closed.

### 2. Valid Markdown can still create forbidden nested horizontal scrollbars

**Files:** `src/renderer/src/styles/globals.css:126,172-188`; `tests/e2e/helpers/surfaceGeometry.ts:48-78`.

`pre` and `table` explicitly use `overflow-x: auto`. A long code line or wide table can therefore create a horizontal scrollbar inside a note or expanded editor even while root `scrollWidth === clientWidth`. The current fixtures contain ordinary prose, so the root/edge helper and eight screenshots do not prove the binding “no horizontal scrollbar” contract for valid arbitrary Markdown content.

**Required fix:** define a narrow-safe wrapping/clamping/table presentation that does not introduce horizontal scrolling, and add adversarial long code/table E2E coverage at 340×480 notes and 420×480 editor minimums.

### 3. Settings operation failures use success/status semantics instead of alerts

**Files:** `src/renderer/src/features/settings/AppearanceSettings.tsx:62-109,241-249`; `src/renderer/src/features/settings/DataSettings.tsx:30-65,93-97`; `src/renderer/src/features/settings/ShortcutSettings.tsx:91-151,280-284`.

Appearance mode/activation/export/deletion failures, data export/import failures, shortcut validation/save failures, pin failures, and capture-test failures all flow through the same `role="status"` node used for success. This contradicts the approved contract that errors use `role="alert"` while nonurgent success uses polite status semantics. Theme import/editor and shared panel feedback already model the required distinction.

**Required fix:** retain a message tone alongside the text, render failures as alerts, and add behavior tests for representative validation, persistence, and native-operation failures.

## Minor issues

### 1. One ledger-deferred failed-deletion test remains unresolved

**Files:** `tests/e2e/theme-workflows.spec.ts:151-160`; `src/renderer/src/features/settings/AppearanceSettings.test.tsx:43-113`.

The E2E opens **Delete custom theme?** and clicks **Cancel**; it never executes **Delete theme**, forces `appearance.deleteCustomTheme` failure, or proves the authoritative row remains and a retry/error path is available. This resolves action-menu and alert containment, but not the ledger’s specifically deferred failed-deletion interaction. The implementation appears to retain authoritative theme state, so this is test debt rather than a separately demonstrated data-loss defect; it should be covered with the error-semantics fix above.

## Deferred-item disposition

- Task 3 real 308px/340px geometry: resolved by Playwright bounds and inspected baselines.
- Task 3 custom-theme action menu/delete alert: menu and cancel interaction resolved; failed deletion remains Minor 1 above.
- Task 4 completed hover token: resolved in source and direct regression coverage.
- Task 5 provider-unmount and Radix-dismiss timer cleanup: resolved with direct fake-timer behavior coverage.
- Task 8 preview ownership, Select Escape, long section names, shortcut retention, native/HUD evidence, hover, and timer findings: addressed as recorded; no regression found in those fixes.
- Task 9 host-keyboard isolation and evidence-record findings: accepted; no tolerance, retry, production authority, or release-claim weakening found.

## Recommendations

1. Fix the three Important findings with focused RED/GREEN behavior tests, including a native Settings event while each notes-owned portal category is open.
2. Add the deferred custom-theme deletion failure test and list the four Settings screenshots in the automated evidence map’s visual inventory for completeness.
3. Because any fix changes source/tests after `2828fa4`, derive a new exact source SHA and rerun the complete unsigned gate/package verification before refreshing evidence.
4. Keep every protected/physical/VoiceOver/status-item-click row `Not run` until genuinely observed.

## Assessment

**Ready to merge? With fixes.** The architecture, visual work, security posture, exact-source evidence, and two automation-boundary rulings are strong, but the current head should not merge as the completed milestone until the three Important contract gaps are fixed and regated.

**Release publication readiness:** **No — Incomplete/Blocked**, independently of branch fixes. No exact release tag, protected signing/notarization/stapling/Gatekeeper artifact, physical macOS matrix, VoiceOver review, independent approval, or promotion authorization has been completed.
