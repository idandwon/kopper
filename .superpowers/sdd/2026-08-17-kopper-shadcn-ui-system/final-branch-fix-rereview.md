# Final whole-branch fix re-review — Kopper shadcn UI-system milestone

## Review identity and scope

- Fix base: `cc7762dfa102deb663509f588e27885f63d2b057`.
- Exact source/test commit: `6054d26965ce66d924079cbcd4fb28dbcb05b38c`; verified tree `c7f57763fbebcc7dd288b40f1127344bbf987c41`.
- Reviewed head: `28a55fafb7794b358454360d893b056f709c3d17`.
- The supplied 25-path package body matches Git’s `cc7762d..28a55fa` diff. Commits after `6054d269` change only the two release documents, the final review/fix records, and the scoped progress ledger.
- I read the final review, fix report, complete fix package, approved design where needed, and implicated final source/tests. Per instruction, I did not rerun the broad gate or mutate source, tests, index, or `HEAD`.

## Original finding verdicts

### 1. Notes-owned portals on native Settings routing — **ADDRESSED**

`DocumentPanel` supplies one route-derived visibility owner (`src/renderer/src/app/DocumentPanel.tsx:199-261`). `useNotesSurfaceOverlay` gates `open` synchronously and clears requested state once while hidden (`src/renderer/src/features/notes/NotesSurfaceVisibility.tsx:24-37`), so it neither loops nor retains state that can reopen on Back. The contract covers panel/section menus and tooltips, Add Section, rename/delete/destination Select, note context menu/submenu and lifecycle tooltip, and Markdown discard (`PanelMenu.tsx:36-37`; `AddSectionDialog.tsx:33`; `SectionManager.tsx:74-81`; `NoteContextMenu.tsx:44-45`; `NoteCard.tsx:80`; `MarkdownEditor.tsx:56`). Native-listener tests exercise the requested owner categories and state/focus/scroll-owner preservation (`src/renderer/src/app/App.test.tsx:164-197,408-505`). No duplicate route decision or hidden-tooltip/stale-reopen path was found.

### 2. Adversarial Markdown horizontal overflow — **ADDRESSED**

Code uses semantic preformatted markup with visual wrapping, and tables retain native table semantics while using fixed layout and wrapped cells (`src/renderer/src/styles/globals.css:172-200`). The new Electron journey retains and checks the exact long code/table strings at 340×480 notes and 420×480 editor (`tests/e2e/document-workflows.spec.ts:180-242`); the helper rejects root overflow, horizontal scroll owners, and descendant excess width (`tests/e2e/helpers/surfaceGeometry.ts:82-126`). No nested Markdown scroll owner, content removal, clamp, or semantic replacement was introduced.

### 3. Settings feedback semantics — **ADDRESSED**

The focused contract maps `error` to alert and nonurgent `status` to polite live-region semantics (`src/renderer/src/features/settings/SettingsFeedback.tsx:3-25`). Appearance failures are error-toned (`AppearanceSettings.tsx:66-119`), Data result/rejection/throw branches are classified (`DataSettings.tsx:30-87`), and shortcut validation/save/pin/capture failures are error-toned while recording, progress, cancellation, empty capture, reset, and success remain status (`ShortcutSettings.tsx:72-168,211-247`). Focused tests cover representative persistence, validation, and native-operation failures (`AppearanceSettings.test.tsx:51-123`; `DataSettings.test.tsx:32-67`; `ShortcutSettings.test.tsx:186-281`). No failed branch in these three surfaces remains a status.

### 4. Failed custom-theme deletion — **NOT ADDRESSED**

The single-click failure path now preserves the authoritative row, renders an alert in the open dialog, and leaves the action retryable (`src/renderer/src/features/settings/AppearanceSettings.test.tsx:87-123`). However, the pending transaction is not protected: see the Important breakage below. Consequently the dialog/retry guarantee does not hold throughout acknowledgement.

## New breakage

### Important — Custom-theme deletion can be dismissed or submitted again before acknowledgement

**Files:** `src/renderer/src/features/settings/AppearanceSettings.tsx:57,109-121,273-301`; `src/renderer/src/features/settings/AppearanceSettings.test.tsx:87-123`.

`preventDefault()` stops Radix’s automatic close for the first destructive click, but there is no deletion-local pending guard. The destructive action and Cancel remain enabled, and `onOpenChange` unconditionally clears `deleteTheme`. While `execute()` is pending, a second Delete click invokes the transaction again, while Cancel or Escape closes the dialog before acknowledgement. Production `DocumentProvider` prevents a second repository mutation, but the second component invocation can still publish a premature failure; closing during a later failed acknowledgement leaves no open retry dialog/action. The focused test resolves immediately and does not exercise this interval.

Required closure is a guarded deletion-pending state that disables both actions, ignores close requests until acknowledgement, permits exactly one `execute` call, and re-enables retry only after failure, with a deferred-promise regression test.

### Critical

None.

### Minor

None.

## Hygiene and evidence scope

- No production TypeScript assertion, IPC/preload/main/security widening, dependency/package/workflow input, timing wait/retry, screenshot mask, or screenshot-tolerance change was found. The Markdown helper’s `0.5` comparison does not admit a one-pixel DOM-width overflow because `clientWidth` and `scrollWidth` are integer measurements.
- The release documents point to `6054d269` / `c7f57763`, the retained `15:55:39Z–15:57:14Z` interval, 69 files / 766 tests, 16/16 E2E, and the 3,172-entry unsigned package result (`docs/releases/demo-parity-automated-evidence.md:5`; `docs/releases/v0.1.0-acceptance.md:18,35,65-78`). Later commits are documentation-only.
- The fix report maps the focused RED/GREEN runs and full gate/package claims to that exact source. Those execution results are supplied evidence and were not independently rerun in this re-review. Its “No known source-fix finding remains” conclusion is not sustained because of the pending-deletion race (`final-branch-fix-report.md:117`).

## Final verdicts

**Merge verdict: NOT READY TO MERGE.** One Important interaction finding remains in the final fix wave.

**Release verdict: INCOMPLETE/BLOCKED — do not publish or promote.** Independently of merge readiness, no exact release tag, protected signing/notarization/stapling/Gatekeeper artifact, physical macOS matrix/status-item exercise, VoiceOver review, independent approval, or promotion authorization has been completed.
