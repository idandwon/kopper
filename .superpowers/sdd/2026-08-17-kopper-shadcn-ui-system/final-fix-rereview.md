# Task 8 final-fix re-review

## Scope and source identity

- Fix base: `21488da6869cd9967cf68b9067b032239f9798bf`
- Exact source commit: `f22d485da218a47e1574fd281ffacf26e246e498` (`92e85fb878d9cc05d1ef45c6f1f9d66d2af10916`)
- Reviewed head: `18471e3384e527ff0059cf03cf87e3a01b2977ca`
- `18471e3` adds only `final-review.md` and `final-fix-report.md`; it changes no production, test, package, or lockfile source.
- The source fix changes no production main-process/preload/shared-contract, package, lockfile, or security-policy file. The only main-process file changed is `src/main/window/windowManager.test.ts`.
- Focused re-run: **10 files passed, 73 tests passed**. Broad suites and Electron journeys were not rerun; their reported assertions were mapped to the reviewed code.

## Finding verdicts

1. **ADDRESSED** — `src/renderer/src/theme/ThemeProvider.tsx:147-175`, `src/renderer/src/features/settings/ThemeEditor.tsx:158-229`, `src/renderer/src/features/settings/ThemeImportDialog.tsx:75-133`, `src/renderer/src/app/DocumentPanel.tsx:147-154`, `src/renderer/src/features/settings/SettingsPage.tsx:48-52`. Opaque owner tokens make cancellation owner-conditional, while save success clears only its exact wrapper and both failure outcomes retain the preview/dialog for retry. Forced unmount releases editor/import ownership, native routing selects Shortcuts, and the deferred focus request lands on Back. Integration and race coverage is at `src/renderer/src/app/DocumentPanel.theme-preview.test.tsx:73-174` and `src/renderer/src/theme/ThemeProvider.test.tsx:522-577`.

2. **ADDRESSED** — `src/renderer/src/features/settings/SettingsPage.tsx:26-35,55-68`, `src/renderer/src/features/settings/SettingsPage.test.tsx:103-124`, `src/renderer/src/app/App.test.tsx:398-413`. The route listener honors `defaultPrevented` and Radix listbox/option ownership. The real shared Select test proves the first Escape only dismisses the listbox; the existing app-level Escape test proves the later unowned Escape returns to notes and restores Search focus.

3. **ADDRESSED** — `src/renderer/src/features/sections/SectionGroup.tsx:59-73`, `src/renderer/src/components/ui/context-menu.tsx:32-60`, `src/renderer/src/features/notes/NoteContextMenu.tsx:128-144`, `src/renderer/src/components/ui/select.tsx:8-52`, `src/renderer/src/features/sections/SectionManager.tsx:224-243`. Headings deliberately wrap/break, while menu and Select labels shrink and ellipsize without removing their full text. The 340×480 Electron journey covers spaced and unbroken headings, both Move submenu labels, both delete options, the selected value, overlay bounds, and root containment at `tests/e2e/document-workflows.spec.ts:93-176`.

4. **ADDRESSED** — `src/renderer/src/features/settings/SettingsPage.tsx:115-124`, `src/renderer/src/features/settings/ShortcutSettings.tsx:58-86`, `src/renderer/src/features/settings/SettingsPage.shortcuts.test.tsx:69-98`. Only Shortcuts is force-mounted and is genuinely hidden while inactive. Its layout-effect lifecycle synchronously stops recording and removes the capture listener; the test proves the candidate survives the round trip and a hidden key event is ignored. No hidden active recorder or lingering listener was found.

5. **ADDRESSED** — `tests/e2e/native-surfaces.spec.ts:25-51,56-188`, `src/main/window/windowManager.test.ts:435-468`. The live Electron tests exercise the fixed main-process event through the existing preload subscription and create the actual detached HUD through the existing renderer capture API. They assert Shortcuts/Back focus, exact window and renderer dimensions, anchoring to a hidden/unfocused panel, focuslessness, visibility, zero scroll, contained status geometry, and later HUD dismissal with the panel still hidden. No production test hook, IPC/preload widening, geometry tolerance, or security relaxation was introduced.

6. **ADDRESSED** — `src/renderer/src/features/notes/NoteCard.tsx:183-195`, `src/renderer/src/features/notes/NoteCard.test.tsx:118-130`. The completed marker explicitly keeps `--completed` for base, normal-hover, and dark-hover states.

7. **ADDRESSED** — `src/renderer/src/features/feedback/PanelFeedback.tsx:49-71,97-123`, `src/renderer/src/features/feedback/PanelFeedback.test.tsx:161-218`. Provider unmount and a real Radix swipe-dismiss path both prove immediate zero timers and no work after draining timers.

## New breakage in the fix diff

**None.** No new production assertions, test-only production seams, preview-owner races, hidden-pane accessibility exposure, global-listener leaks, inaccessible label removal, security widening, or materially flaky timer dependency was found.

## Evidence boundary disposition

**Accepted and accurately bounded.** Playwright does not click the physical macOS status item. The live test begins at the real BrowserWindow `webContents.send` event; the WindowManager test clicks the generated Settings menu callback and proves show/focus/send in the JS/native abstraction. The actual physical status-item click therefore remains an unclaimed manual/protected boundary, not an automated claim. The live HUD test proves real expiry behavior; the exact 1,800 ms constant remains separately asserted by the WindowManager timer test, so the report's timing statement should be read as combined evidence rather than a physical stopwatch claim.

## Final verdict

**CLEAN FOR THE EXACT-SOURCE GATE.** All seven original findings are addressed at `f22d485`; no residual blocker was found. Physical/protected release acceptance remains outside this automated Task 8 disposition.
