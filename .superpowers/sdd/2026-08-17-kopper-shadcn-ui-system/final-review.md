# Final whole-range review — Task 8

## Verdict

**FIXES REQUIRED before the exact-source gate.**

No Critical findings were found. Five Important findings remain: forced Settings navigation can strand an unpersisted theme preview, route-level Escape does not honor a Radix Select that already consumed Escape, long section titles are clipped by converted shared controls, unsaved shortcut candidates are discarded by ordinary tab navigation, and two Electron behaviors required by the approved E2E strategy are not exercised end to end. Two deferred items remain Minor.

This review did not modify source, tests, the index, or `HEAD`; therefore no `final-fix-report.md` was created.

## Review range and scope

- Base: `09057d8`
- Reviewed head: `21488da6869cd9967cf68b9067b032239f9798bf`
- Head tree: `ffd261a24db6166bc499431b5db84bea7dac4d22`
- Declared head matched the checked-out `HEAD` exactly.
- Range size: 80 files, 4,354 insertions, 757 deletions.
- Inputs reviewed: approved specification, Task 8 brief, progress ledger, the 327 KiB review package, final changed production/test files, related route/theme/security/persistence code, and all eight final notes/settings images.

The literal range correctly includes:

- `5a2e65d`, the 1,119-line implementation plan; and
- `2116862`, which adds only `.worktrees/` to `.gitignore`.

The latter is worktree infrastructure, not UI behavior. No package, lockfile, preload, shared-contract, or production main-process source changed in this range; the main-process range change is test-only.

## Findings

### Important 1 — A forced Settings tab route can leave an unpersisted theme preview active

**Files:**

- `src/renderer/src/app/DocumentPanel.tsx:146-152`
- `src/renderer/src/features/settings/SettingsPage.tsx:101-108`
- `src/renderer/src/features/settings/AppearanceSettings.tsx:46-54`
- `src/renderer/src/features/settings/ThemeEditor.tsx:142-149,188-193`
- `src/renderer/src/features/settings/ThemeImportDialog.tsx:89-100`

**Classification:** introduced integration defect.

The native Settings event unconditionally changes an already-open Settings route to `shortcuts`. Radix tabs then unmount `AppearanceSettings`. `ThemeEditor` and `ThemeImportDialog` cancel previews only through their normal close handlers; neither the preview owner nor `AppearanceSettings` cancels on forced unmount. A user can preview valid unsaved tokens, choose **Settings…** from the macOS status item, and land on Shortcuts while the renderer continues using the orphaned preview. A dirty editor is also discarded without its confirmation path. This violates repository-authoritative theme state and the preview/cancel contract.

**Smallest fix:** make the Appearance preview owner cancel its owned preview during route/tab unmount (without clearing a newer owner), and define the native-route behavior while a modal is active. Add a behavior test that edits/previews a token, fires the native Settings event, verifies Shortcuts/focus behavior, and verifies the persisted theme is restored unless a save was acknowledged.

### Important 2 — Escape can close Settings after a Radix Select has already consumed it

**Files:**

- `src/renderer/src/features/settings/SettingsPage.tsx:23-50`
- `src/renderer/src/features/settings/SettingsPage.test.tsx:82-109`

**Classification:** introduced by the full-page route handler.

The window listener does not check `event.defaultPrevented`, and `focusedOwnerKeepsEscape` recognizes native `HTMLSelectElement` but not the shared Radix listbox/option owner. Radix Select handles Escape in a document capture listener, prevents the event, and dismisses its listbox; the same event then reaches the Settings window listener, which can also call `closeSettings()`. The test uses a native mocked `<select>`, so it does not exercise the production primitive or this propagation path.

**Impact:** one Escape intended to close the Appearance-mode popup can also leave Settings, violating overlay ownership and deterministic focus restoration.

**Smallest fix:** return when `event.defaultPrevented` and recognize the relevant Radix owner as a defensive fallback. Replace/add a behavior test using the real shared Select: first Escape closes only the listbox; a subsequent unowned Escape returns to notes and restores the correct focus target.

### Important 3 — Long section names are clipped rather than intentionally wrapped or clamped

**Files:**

- `src/renderer/src/components/ui/button.tsx:7-8`
- `src/renderer/src/features/sections/SectionGroup.tsx:61-76`
- `src/renderer/src/components/ui/context-menu.tsx:30-60`
- `src/renderer/src/components/ui/select.tsx:9-32`
- `src/renderer/src/features/sections/SectionManager.tsx:212-231`

**Classification:** mixed; the section-heading regression and raw-select conversion are introduced, while the old submenu sizing problem was carried into an explicitly in-scope containment pass.

`SectionGroup` converted its feature-owned heading action to `Button`, inheriting `shrink-0 whitespace-nowrap` without a local override. The panel shell then hides an arbitrarily long section title instead of wrapping it. Move-to submenu content is fixed at `w-36` with `overflow-x-hidden`, and items have no wrapping or ellipsis. The delete-destination Select similarly retains an arbitrary `min-w-40`, trigger-width popup, and items with no long-label treatment. Section titles are unbounded at the repository schema.

**Impact:** users cannot reliably read or distinguish valid long section names in the ledger header, move submenu, or destructive move destination, even though root-level geometry tests can still pass because clipping suppresses document overflow.

**Smallest fix:** add `min-w-0` to the shrinking heading seam, override the heading button with intentional wrapping, and give menu/Select labels an explicit wrap or ellipsis contract while keeping the popup viewport-capped. Add real 340×480 tests with a long spaced and unbroken section title across the heading, Move to submenu, and delete destination.

### Important 4 — Ordinary Settings tab changes discard an unsaved shortcut candidate

**Files:**

- `src/renderer/src/features/settings/SettingsPage.tsx:101-108`
- `src/renderer/src/features/settings/ShortcutSettings.tsx:43-54`
- `src/renderer/src/features/settings/ShortcutSettings.test.tsx:138-175`

**Classification:** pre-existing behavior retained from the Sheet, but an explicit in-scope specification gap rather than out-of-scope debt.

Inactive Radix `TabsContent` unmounts by default. `ShortcutSettings` owns its candidate locally and reconstructs it from authoritative shortcuts on mount. Editing **Toggle panel**, switching to Appearance/Data, and returning therefore silently loses the candidate. The focused test proves survival across unrelated document publication but no integration test performs a tab round trip.

**Impact:** in-progress form input is discarded contrary to the specification's Settings workflow rule.

**Smallest fix:** retain/lift the candidate across category navigation while explicitly stopping shortcut recording when the pane becomes inactive; do not blindly keep a hidden global recorder active. Add a Shortcuts → Appearance → Shortcuts behavior test for both candidate retention and recorder cleanup.

### Important 5 — Required native-entry and detached-HUD Electron evidence is missing

**Files:**

- `tests/e2e/demo-parity.spec.ts:226-288`
- `tests/e2e/launch.spec.ts:27-87`
- `src/renderer/src/features/capture/CaptureToast.test.tsx:63-104`
- `src/main/window/windowManager.test.ts:239-326`

**Classification:** introduced Task 7 evidence gap.

The 12 Electron journeys exercise panel-menu Settings entry, editor/onboarding/recovery geometry, security, and themes. They do not exercise the main-process/status-item → fixed preload event → Shortcuts route as one runtime path, and they never display and measure the detached 340×72 capture HUD. The HUD evidence is split between main-process fake-window bounds and renderer class assertions; the native Settings path is likewise split across unit tests.

**Impact:** the approved minimum E2E strategy for native Settings entry and capture-feedback containment is not met, so exact-source acceptance cannot rely on the otherwise passing E2E count.

**Smallest fix:** add focused Electron journeys that drive the native Settings event path and trigger a capture outcome, then assert the Shortcuts tab/focus route and HUD window/document geometry, focuslessness, no scroll, and fixed bounds. Do not use masks or relaxed geometry tolerances.

### Minor 1 — Completed lifecycle marker loses its stable semantic hover color

**File:** `src/renderer/src/features/notes/NoteCard.tsx:184-195`

**Classification:** introduced by conversion to generic `Button`; this confirms deferred finding 1.

The completed branch supplies only a resting `bg-[var(--completed)]`. `variant="ghost"` still contributes generic `hover:bg-accent` and `dark:hover:bg-accent/50`, so the completed circle can stop presenting `--completed` while hovered. Behavior and persistence are unaffected, but the lifecycle signature is visually unstable.

**Smallest fix:** explicitly preserve the completed token for normal and dark hover variants and add a class/style-state regression assertion.

### Minor 2 — Two PanelFeedback cleanup paths still lack direct behavior assertions

**Files:**

- `src/renderer/src/features/feedback/PanelFeedback.tsx:49-71,97-102,120-123`
- `src/renderer/src/features/feedback/PanelFeedback.test.tsx:126-185`

**Classification:** test debt only; this confirms deferred finding 2.

The implementation is sound on inspection: replacement, explicit dismiss, and unmount all route through `clearNoticeTimer`. Existing tests prove timer replacement/expiry and perform one unmount, but do not assert timer count after provider unmount or trigger Radix `onOpenChange(false)` and prove cancellation.

**Smallest fix:** use fake timers for a provider-unmount case and dismiss through Radix's behavior path, asserting zero timers and no later state work. This is nonblocking by itself.

## Fresh validation evidence

All required commands were run at `21488da6869cd9967cf68b9067b032239f9798bf`:

| Command | Fresh result |
| --- | --- |
| `pnpm test` | PASS — 67 files, 748 tests; duration 6.45s. No test warnings/failures. |
| `pnpm typecheck` | PASS — `tsc -b --pretty false`; no diagnostics. |
| `pnpm build` | PASS — typecheck plus Electron Vite build. Main: 38 modules, 147.40 kB; preload: 240 modules, 256.93 kB; renderer: 680 modules, CSS 50.01 kB, JS 1,874.29 kB. Noise: 38 Rollup warnings that dependency-level Radix `"use client"` directives were ignored. |
| `pnpm test:e2e` | PASS — 12/12 using one worker, 19.3s. No failed/retried/skipped tests. Playwright's generated `test-results/.last-run.json` was removed after the run; screenshot baselines remained unchanged. |
| `pnpm audit:source` | PASS — `{ "ok": true, "source": "src", "checks": { "files": 102 }, "failures": [] }`. |
| `git diff --check 09057d8..HEAD` | PASS — no output. |

Final pre-report `git status --short --untracked-files=all` was empty. These passing commands establish a clean run, but they do not negate the behavior/evidence findings above.

## Semantic scans and raw-control inventory

### Raw controls

The brief's literal command returned 26 lines because its glob did not exclude nested `components/ui` in this invocation and because tests live under `src/renderer/src`. Rescoped to production and excluding `**/components/ui/**` plus `*.test.*`, it returned **0 feature-level raw controls**.

The only raw production JSX controls are the native backing elements inside the shared primitives:

- `src/renderer/src/components/ui/input.tsx:7` — the authoritative shared `Input` implementation.
- `src/renderer/src/components/ui/textarea.tsx:7` — the authoritative shared `Textarea` implementation.

These are primitive internals, not feature exceptions. There are no raw production `<button>` or `<select>` elements. Theme color pickers use shared `Input type="color"`, intentionally delegating the picker UI to the browser. Shortcut recording uses shared `Button`, `Input`, and `RadioGroup` while retaining product-specific global keyboard capture. Markdown task checkboxes are generated inert content semantics, not feature-authored generic controls.

### Assertions, obsolete Sheet, effects, and widths

- The broad assertion scan returned 166 textual matches, 43 in production; most are import aliases, prose such as “as done,” and pre-range `as const`/type assertions. Inspection of added production lines found **0 new TypeScript assertions and 0 new non-null assertions**. The existing `src/main/clipboard/noteClipboard.ts:65` assertion predates the range.
- Obsolete scan: **0** references to `PanelSettingsSheet`, `components/ui/sheet`, or `globalThis.confirm`; both Sheet files are deleted.
- Overflow/width scan: 111 matches. Legitimate fixed values are the product panel cap (380), capture HUD contract (340×72 in main code), viewport-capped dialogs/portals, narrow menu defaults, and the bounded ThemeEditor. The section-title/menu/Select exceptions are finding 3.
- Added listeners and timers generally clean up correctly: native Settings subscription, route Escape listener, panel shortcuts, shortcut recording, theme validation debounce, CaptureToast timer/subscription, onboarding/recovery lifecycles, and PanelFeedback timer. The direct-test debt is Minor 2.
- New modules use direct local imports; no project barrel was introduced. State updates are immutable, route values are naturally narrowed, and effects are limited to DOM/native/timer lifecycle work.
- Added colors consume semantic tokens. The scan found no added hard-coded renderer hex/rgb/hsl values; dynamic swatch styles receive schema-validated theme tokens.

## Specification coverage

| Acceptance criterion | Review result |
| --- | --- |
| 1. Full-panel Settings; no drawer | PASS. `DocumentPanel` conditionally renders `SettingsPage`; Sheet implementation/consumer are removed. Mounted-hidden notes preserve local state without remaining visible or accessible. |
| 2. Correct entry tabs | PASS in code/unit coverage: panel menu → Appearance; native event → Shortcuts. Required whole-path Electron evidence is missing (Important 5). |
| 3. Back/Escape focus and ownership | Back and menu/search restoration pass. Radix Select Escape ownership fails (Important 2). |
| 4. Persistence-backed Pin/Unpin | PASS. Both entry surfaces wait for validated IPC results; failure never flips authoritative UI state. |
| 5. Shared shadcn contract | PASS for control ownership. No feature-level raw generic control remains. |
| 6. Oxide Ledger identity | PASS overall: semantic tokens, rail, cards, composer, capture highlighting, and lifecycle choreography remain. Completed-marker hover has one Minor defect. |
| 7. No supported-size horizontal overflow | PASS for covered deterministic surfaces and fresh geometry runs. Long section labels are clipped rather than correctly contained (Important 3), and detached HUD lacks real Electron geometry evidence (Important 5). |
| 8. One deliberate scroll owner | PASS for notes, Settings, editor, onboarding, and recovery. ThemeEditor has an explicit bounded token owner; generic over-height dialogs own their bounded scrolling. Body/root remain hidden. |
| 9. Long/pending/error/overlay containment | Paths, theme names, imports, errors, dialogs, and standard menus are handled; section names fail the explicit long-content contract (Important 3). |
| 10. Light/Dark visual baselines | PASS — final notes and Settings baselines exist at 380×640 and 340×480 for both modes. |
| 11. Keyboard/focus/motion/live regions | Toggle, dialog, focus restoration, reduced motion/transparency, full note accessibility, and one Radix announcement channel are covered. Select Escape fails; two feedback cleanup tests remain Minor debt. |
| 12. Persistence/capture/security/theme/release integrity | Persistence, capture publication while Settings is visible, import validation, preload shape, CSP, navigation blocking, sandbox/context isolation, and disabled Node integration remain intact. Forced preview unmount violates theme authority (Important 1). Release evidence remains blocked as required. |

## Targeted architecture review

- **Route and mounted-hidden state:** `DocumentPanel` owns a discriminated notes/settings route. Query, lifecycle view, selection, composer draft, capture subscription, and authoritative publications survive a Settings round trip. Notes shortcuts are disabled while hidden; Add Section closes on native navigation.
- **Focus:** Back restoration uses a narrow layout effect and menu/search refs. Settings entry autofocuses Back without scrolling. The remaining ownership defect is the real Radix Select Escape path.
- **Geometry:** Root/body overflow is disabled; each primary surface declares one owner and uses `min-h-0`/`min-w-0`. Composer/header/footer boundaries are outside their owner. Portal content has collision padding and viewport caps. Finding 3 identifies clipping that root scroll metrics cannot detect.
- **Persistence and capture:** note/section/document commands remain repository acknowledged; completion animation starts only after acknowledgement; drafts continue to flush; capture publication and highlight remain mounted while Settings is visible. Pin and shortcut changes consume validated IPC envelopes.
- **Theme authority:** schemas, contrast checks, opaque backgrounds, semantic tokens, last-valid preview, two-step upsert/activation, and import decisions are preserved. The forced-unmount cleanup hole is Important 1.
- **Security:** production main/preload/shared/package inputs were not widened. Existing windows retain `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`; navigation/popups/requests remain denied outside the local renderer policy; Markdown links remain inert.
- **Accessibility:** controls have accessible names, icon-only feature controls have tooltips, ToggleGroup exposes pressed state, dialogs trap/restore focus, note previews retain full DOM/accessible content, errors/statuses use alert/status semantics, and reduced motion/transparency rules remain. No protected VoiceOver or physical claim is made.

## Screenshot inspection

Inspected at native pixel dimensions:

1. Notes Light — 380×640
2. Notes Light — 340×480
3. Notes Dark — 380×640
4. Notes Dark — 340×480
5. Settings Light — 380×640
6. Settings Light — 340×480
7. Settings Dark — 380×640
8. Settings Dark — 340×480

Observations: all images are the stated native dimensions; no masks are configured; rail, lifecycle circles, cards, section rules, composer, and Oxide Ledger color identity remain coherent. The 340×480 notes baselines show a clean collection/composer boundary with no overlap. Settings is visibly a full-panel page with fixed header/tabs and one body scrollbar; the narrow image ends mid-list as truthful scrollable continuation rather than scaling or masking content. Light and Dark modes use the intended semantic contrast. The inherited `maxDiffPixelRatio: 0.01` was not increased by this range; fresh screenshots matched without updating files.

## Deferred-minor disposition

1. **Completed marker hover:** confirmed as a real **Minor** visual regression; fix recommended with the blocking batch only if kept narrowly scoped and tested.
2. **PanelFeedback unmount/Radix-dismiss timer tests:** confirmed as **Minor test debt**, not a demonstrated runtime defect. Code cleanup is present. Add direct assertions when closing the blocking findings.

## Strengths

- The full-panel route is substantially cleaner than Sheet ownership and preserves the difficult notes/composer state correctly.
- Shared Radix primitives now own generic fields, overlays, lifecycle selection, labels, tooltips, destructive confirmation, and visible feedback.
- Persistence-first note choreography, pin behavior, theme validation, import preview decisions, and capture authority remain nonoptimistic.
- The geometry helper checks exact document dimensions, visible owner identity, and element right edges without masks; secondary minimum surfaces received meaningful Electron coverage.
- Security coverage is strong and the UI work does not widen preload or renderer authority.
- All eight final baselines retain a recognizable, restrained Oxide Ledger design rather than a generic dashboard restyle.

## Release impact and final ruling

The fresh validation suite passes at the reviewed SHA, but **`21488da` is not ready to become the exact-source release candidate** because Important behavior and evidence findings remain. Apply each fix with a failing behavior test first, create the reviewed source commit, rerun the complete Task 8 validation, and only then proceed to Task 9's exact-source unsigned/package/release-evidence gate.

Release remains blocked independently by the approved policy: existing release evidence predates this production source, and protected/physical acceptance rows must remain unclaimed until genuinely completed. No release, notarization, VoiceOver, or physical-device claim is made here.
