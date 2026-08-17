# Final whole-branch fix report — Kopper shadcn UI-system milestone

## Status

**FINAL BRANCH FIX WAVE COMPLETE; RELEASE INCOMPLETE/BLOCKED.** All three Important findings and the Minor coverage finding in `final-branch-review.md` are addressed at one exact source commit. The fresh ordered unsigned gate passed. No protected, physical, signing, notarization, stapling, Gatekeeper, VoiceOver, independent-approval, publication, or promotion work was run or claimed.

## Source identity

- Starting clean HEAD: `cc7762dfa102deb663509f588e27885f63d2b057`.
- Exact source/test commit: `6054d26965ce66d924079cbcd4fb28dbcb05b38c` — `fix: close final shadcn UI findings`.
- Exact source tree: `c7f57763fbebcc7dd288b40f1127344bbf987c41`.
- Source commit time: `2026-08-17T18:55:24+03:00`.
- No dependency, lockfile, package configuration, workflow, IPC, preload, production main-process, repository-authority, or security-policy input changed.

## RED evidence recorded before production edits

### Focused component RED

```bash
pnpm vitest run \
  src/renderer/src/app/App.test.tsx \
  src/renderer/src/features/settings/AppearanceSettings.test.tsx \
  src/renderer/src/features/settings/DataSettings.test.tsx \
  src/renderer/src/features/settings/ShortcutSettings.test.tsx
```

Exact result: **4 failed files; 12 failed / 36 passed tests (48 total)**.

Observed failures:

- native Settings left the panel dropdown, SectionManager dropdown, rename dialog, delete alert, note context menu/submenu, and Markdown discard alert exposed above Settings;
- the existing Add Section native-route assertion passed because it had a one-off component effect, demonstrating the duplicated seam that the shared contract replaced;
- Appearance mode failure and custom-theme deletion failure did not expose alert semantics;
- Data export/import failures remained statuses;
- shortcut validation, rejected capture, and pin failures remained statuses.

### Focused Electron RED

```bash
pnpm build
pnpm exec playwright test tests/e2e/document-workflows.spec.ts \
  --grep "wraps adversarial code"
```

Build passed. The one focused journey failed: a long valid code line produced a measured descendant right edge of **5252.078125 px** against the allowed **340.5 px** at the 340×480 notes surface.

## Focused GREEN evidence

```text
Portal/settings component set: 4 files / 48 tests passed.
Related notes/sections/editor/panel set: 5 files / 27 tests passed.
Focused total: 9 files / 75 tests passed.
Focused Markdown Electron journey: 1/1 passed at 340×480 notes and 420×480 editor.
Typecheck: passed with no diagnostics.
```

No sleep, retry, timeout increase, mask, screenshot tolerance, or test-only production authority was added.

## Finding dispositions

### Important 1 — notes-owned portals survive native Settings routing

**Addressed.** `DocumentPanel` now owns one `NotesSurfaceVisibilityProvider`. The shared `useNotesSurfaceOverlay` contract synchronously gates controlled open state and uses a layout effect only to synchronize the underlying Radix owner state when notes become hidden.

Consumers cover every notes-owned portal root: panel dropdown and tooltip; Add Section; SectionManager dropdown, tooltip, rename, delete, and destination Select; note context root and submenu; note lifecycle tooltip; and Markdown discard alert. Native `onOpenSettings` integration tests open every requested portal category, prove Shortcuts is the only visible/accessibility route and the only primary scroll owner, prove Back receives entry focus, and prove Back restores Search focus. The dirty-editor test also proves editor text, note selection, and composer draft survive while only the discard alert closes.

### Important 2 — nested Markdown horizontal scrollbars

**Addressed.** Code blocks use `white-space: pre-wrap` plus anywhere wrapping and retain monospace/readable block styling. GFM tables render at 100% width with fixed layout; headers and cells wrap long content. Neither `pre` nor `table` owns horizontal scrolling.

The new Electron fixture uses a 720-character unbroken code token and a six-column table containing repeated 280-character unbroken cells. It proves exact Markdown remains in the DOM/accessibility label, root width remains contained, and no visible Markdown descendant is a horizontal owner or has excess `scrollWidth` at 340×480 notes and 420×480 expanded editor.

### Important 3 — Settings failures use status semantics

**Addressed.** `SettingsFeedbackValue` is exactly `{ text, tone: "status" | "error" }`; `SettingsFeedback` maps errors to `role="alert"` and nonurgent progress, success, cancellation, and empty-capture results to polite status semantics. Appearance, Data, and Shortcuts use this one direct-import component.

Coverage proves alert semantics for Appearance persistence/deletion failure, Data import/export failures, shortcut validation failure, pin failure, and capture native-operation rejection. Existing tests continue to prove polite status behavior for cancellation, progress, success, and reset outcomes.

### Minor — failed custom-theme deletion

**Addressed directly.** The component test forces `appearance.deleteCustomTheme` to return failure, verifies the authoritative theme row remains, renders the error inside the still-open alert dialog, and proves **Delete theme** remains enabled for retry. The destructive action now prevents Radix auto-close until repository acknowledgement; success closes it, failure does not.

## Precommit full validation and screenshots

- `pnpm test`: **69 files / 766 tests passed** in 7.38 s.
- `pnpm build`: passed, including typecheck; main 38, preload 240, renderer 682 modules.
- `pnpm test:e2e`: **16/16 passed** in 25.8 s.
- All eight deterministic Light/Dark notes/Settings screenshot comparisons passed. No snapshot pixel, mask, or tolerance changed, so no baseline update was made.

## Fresh exact-source unsigned gate

Exact retained interval: `RUN_START=2026-08-17T15:55:39Z`; `RUN_END=2026-08-17T15:57:14Z`.

The ordered gate stopped on no failure:

1. `pnpm test` — Pass: 69 files / 766 tests, 10.19 s.
2. `pnpm typecheck` — Pass: no diagnostics.
3. `pnpm build` — Pass: main 38 / preload 240 / renderer 682 modules; CSS 50.62 kB; renderer JS 1,882.44 kB. Existing dependency-level ignored `use client` warnings only.
4. `pnpm test:e2e` — Pass: 16/16, one worker, 23.3 s.
5. `pnpm audit:deps` — Pass: no known vulnerabilities.
6. `pnpm audit:source` — Pass: `ok: true`, 104 source files, zero failures.
7. `pnpm validate:release-docs` — Pass: 91 canonical rows in both acceptance records.
8. `actionlint .github/workflows/*.yml` — Pass: no findings/output.
9. `pnpm package:unsigned` — Pass: universal directory app produced; signing explicitly skipped because identity was null.
10. `pnpm verify:package "release/mac-universal/Kopper.app"` — Pass: 3,172 ASAR entries, exact `arm64` and `x86_64`, one native module, ID `com.kopper.app`, minimum macOS 14.0, zero failures.

Cleanup passed: no `kopper-e2e-*`/`out/main/index.js` process, no `kopper-e2e-*` or `kopper-dialog-outside-*` fixture directory, and generated `test-results/` was removed.

## Evidence and review records

- Evidence commit: `e318a23f410bfe9d586f936d1ad5c207a80506ba` — `docs: refresh final shadcn UI evidence`; only the two release evidence documents changed.
- The release documents point to exact source/tree `6054d269...` / `c7f57763...`, the fresh interval, observed counts, and unsigned package facts.
- This report and `final-branch-review.md` are carried by the commit titled `docs: record final shadcn UI branch review`; that commit changes no production/package source.

## Residuals and release ruling

No known source-fix finding remains. The accepted automation boundary around a physical macOS status-item click remains unchanged and unclaimed. Dependency-level build warnings remain nonblocking and recorded.

**Release remains Incomplete — blocked; do not publish or promote.** Exact tag, protected signing/notarization/stapling/Gatekeeper checks, protected artifact verification, physical macOS matrices, physical status-item interaction, VoiceOver review, independent approval, and promotion authorization remain `Not run`.
