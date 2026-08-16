# macOS Capture Task 5 report

## Status

Implemented the floating panel WindowManager, menu-bar lifecycle, transactional shortcuts/window preference service, permission/store-gated ShortcutManager integration, strict IPC/preload methods, and renderer Shortcut Settings.

No commit was created. The working tree is intentionally unstaged for review.

## RED evidence

- First post-contract `pnpm typecheck` failed with 3 expected integration errors: the old contract assertion denied `requestCapture`, and two `DocumentProvider.test.tsx` API fixtures lacked the five new bridge methods.
- First `pnpm vitest run src/renderer/src/features/settings/ShortcutSettings.test.tsx` failed 6/6. It exposed candidate reset on recording completion and ambiguous implicit `status` semantics from `<output>`; both were corrected before the final run.
- First two `pnpm test:e2e` runs failed 1/3 because the existing startup test synchronously checked visibility before either onboarding or the panel had rendered. The test now waits for the union of the two valid startup states before branching.

## GREEN evidence

- `pnpm test`: 54 files, 448 tests passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed; main, bundled sandbox preload, and renderer built.
- `pnpm test:e2e`: 3/3 passed.
- `pnpm package:dir`: passed for macOS arm64.
- Packaged native verification found `dist/mac-arm64/Kopper.app/Contents/Resources/app.asar.unpacked/node_modules/uiohook-napi/build/Release/uiohook_napi.node`.
- Packaged launch smoke stayed alive for 4 seconds with a temporary user-data directory, produced no fatal/native-hook diagnostics, was terminated, and left no matching process/temp directory.
- `git diff --check` passed; `git diff --cached --name-only` was empty.

## Implementation and invariant notes

### Window/menu lifecycle

- `WindowManager` owns both the main panel and deduplicated editor windows, including secure navigation/popup denial.
- Main panel defaults to 380×640, minimum 340×480, active-display right inset 24px, visible remembered-bounds selection, and work-area clamping.
- Main panel is transparent/frameless, visible on all workspaces/fullscreen, supports native pin/show/hide/toggle, converts close to hide unless quitting, and flushes debounced bounds on hide/quit.
- Editors retain normal close behavior.
- Hidden capture acknowledgment uses `showInactive()` and 1800ms auto-hide; focus cancels auto-hide and already-visible panels are unchanged. No acknowledgment path calls `show()` or `focus()`.
- On granted/continued onboarding, macOS Dock hiding is one-shot and one status item is created with Open, Capture, Settings, and Quit. The status icon is a fixed programmatic template image, so no loose runtime asset is required.
- `window-all-closed` no longer quits.

### Shortcut/native transactions

- Domain/schema now supports Double Shift or accelerator capture, configurable panel toggle, pin, and bounds commands. These are non-undoable; note undo overlays current shortcuts/window.
- `ShortcutManager` owns global registrations and lazy Double Shift monitor construction. Capture enablement is controlled by `CaptureRuntime`; panel toggle remains independent.
- Applies tear down desired-owned bindings only, support accelerator swaps, clean partial desired state, and restore prior valid bindings/monitor on any registration/start failure. Dispose/reset unregister owned accelerators and stop the monitor.
- `PreferenceService` shares `MainOperationCoordinator`, applies native state before repository acknowledgement, and restores the exact prior native shortcuts, pin, and actual window bounds on persistence/native failure.
- Startup applies persisted preferences before capture reconciliation. Runtime can retry a repaired persisted binding after an initial fixed conflict.
- Import/create replacement invokes the native transaction before source replacement. A conflicting imported/default binding returns `shortcut_conflict` without overwriting the source; write failure restores prior native state.
- `DocumentFiles` retains its existing serialization when no replacement hook is supplied and delegates full replacement serialization to the transactional hook in production, avoiding nested coordinator deadlock.

### IPC/preload/settings security

- Generic command IPC explicitly rejects all `shortcuts.*` and `window.*` commands even though the shared domain schema recognizes them.
- Dedicated strict channels expose only validated data for capture request, shortcut validation/save, pinning, and the payload-free open-settings event.
- Capture requests use the same permission/store-gated service from menu, monitor/accelerator, and renderer.
- No Electron, native hook, clipboard, app identity, or native window object is exposed.
- Settings uses a controlled Sheet and controlled Shortcuts/Appearance/Data tabs. Menu Settings activates the normal panel and emits the validated settings event.
- Shortcut recording uses immutable candidate updates, ignores modifier-only input, maps Escape to cancel/restore, leaves conflicts unsaved with live status feedback, and routes Reset through the same acknowledged transaction as Save.
- Test Capture uses only `requestCapture`; pin UI remains tied to the authoritative document rather than optimistic local state; unavailable capture is visibly explained and Test Capture is disabled.

## Changed files

- `src/main/capture/captureRuntime.test.ts`
- `src/main/capture/captureRuntime.ts`
- `src/main/createMainWindow.test.ts` (deleted; coverage migrated)
- `src/main/createMainWindow.ts` (deleted; implementation migrated)
- `src/main/domain/commandService.test.ts`
- `src/main/domain/commandService.ts`
- `src/main/files/documentFiles.ts`
- `src/main/index.ts`
- `src/main/ipc/registerIpcHandlers.test.ts`
- `src/main/ipc/registerIpcHandlers.ts`
- `src/main/preferences/preferenceService.test.ts` (new)
- `src/main/preferences/preferenceService.ts` (new)
- `src/main/shortcuts/shortcutManager.test.ts` (new)
- `src/main/shortcuts/shortcutManager.ts` (new)
- `src/main/window/windowManager.test.ts` (new)
- `src/main/window/windowManager.ts` (new)
- `src/preload/index.test.ts`
- `src/preload/index.ts`
- `src/renderer/src/app/App.test.tsx`
- `src/renderer/src/app/App.tsx`
- `src/renderer/src/app/DocumentProvider.test.tsx`
- `src/renderer/src/features/settings/ShortcutSettings.test.tsx` (new)
- `src/renderer/src/features/settings/ShortcutSettings.tsx` (new)
- `src/shared/domain/commands.test.ts`
- `src/shared/domain/commands.ts`
- `src/shared/domain/document.ts`
- `src/shared/ipc/contract.test.ts`
- `src/shared/ipc/contract.ts`
- `tests/e2e/launch.spec.ts`

## Manual risks

- Actual cross-application capture/focus behavior, Accessibility grant/revoke, secure-input sources, Dock/status-item interaction, and Finder launch still require manual validation on a macOS 14+ desktop.
- The package is unsigned and uses the default Electron application icon; electron-builder reported no valid signing identity. This does not affect `package:dir` verification but affects distribution behavior.
- Vite continues to emit the repository’s pre-existing Radix `"use client"` bundle warnings; build exits successfully.

## Recommended next step

Run independent review, then manually execute the milestone matrix on macOS 14+ with Accessibility permission, multiple source apps, alternate accelerator, pin/toggle/close/quit, permission revocation, and data-replacement conflict cases.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Implemented the scoped WindowManager, menu lifecycle, transactional shortcut/window domain and service layer, strict IPC/preload bridge, runtime integration, and Shortcut Settings without unrelated product changes."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "Final evidence includes 448 passing unit/component tests, 3 passing Electron E2E tests, passing typecheck/build/package:dir, unpacked native-module verification, packaged launch smoke, changed-file inventory, and clean diff/staging checks."
    }
  ],
  "changedFiles": [
    "src/main/capture/captureRuntime.test.ts",
    "src/main/capture/captureRuntime.ts",
    "src/main/createMainWindow.test.ts (deleted)",
    "src/main/createMainWindow.ts (deleted)",
    "src/main/domain/commandService.test.ts",
    "src/main/domain/commandService.ts",
    "src/main/files/documentFiles.ts",
    "src/main/index.ts",
    "src/main/ipc/registerIpcHandlers.test.ts",
    "src/main/ipc/registerIpcHandlers.ts",
    "src/main/preferences/preferenceService.test.ts",
    "src/main/preferences/preferenceService.ts",
    "src/main/shortcuts/shortcutManager.test.ts",
    "src/main/shortcuts/shortcutManager.ts",
    "src/main/window/windowManager.test.ts",
    "src/main/window/windowManager.ts",
    "src/preload/index.test.ts",
    "src/preload/index.ts",
    "src/renderer/src/app/App.test.tsx",
    "src/renderer/src/app/App.tsx",
    "src/renderer/src/app/DocumentProvider.test.tsx",
    "src/renderer/src/features/settings/ShortcutSettings.test.tsx",
    "src/renderer/src/features/settings/ShortcutSettings.tsx",
    "src/shared/domain/commands.test.ts",
    "src/shared/domain/commands.ts",
    "src/shared/domain/document.ts",
    "src/shared/ipc/contract.test.ts",
    "src/shared/ipc/contract.ts",
    "tests/e2e/launch.spec.ts"
  ],
  "testsAddedOrUpdated": [
    "src/main/window/windowManager.test.ts",
    "src/main/shortcuts/shortcutManager.test.ts",
    "src/main/preferences/preferenceService.test.ts",
    "src/renderer/src/features/settings/ShortcutSettings.test.tsx",
    "src/main/capture/captureRuntime.test.ts",
    "src/main/domain/commandService.test.ts",
    "src/main/ipc/registerIpcHandlers.test.ts",
    "src/preload/index.test.ts",
    "src/renderer/src/app/App.test.tsx",
    "src/renderer/src/app/DocumentProvider.test.tsx",
    "src/shared/domain/commands.test.ts",
    "src/shared/ipc/contract.test.ts",
    "tests/e2e/launch.spec.ts"
  ],
  "commandsRun": [
    {
      "command": "pnpm test",
      "result": "passed",
      "summary": "54 test files and 448 tests passed."
    },
    {
      "command": "pnpm typecheck",
      "result": "passed",
      "summary": "TypeScript project build completed with no errors."
    },
    {
      "command": "pnpm build",
      "result": "passed",
      "summary": "Main, bundled sandbox preload, and renderer production bundles built."
    },
    {
      "command": "pnpm test:e2e",
      "result": "passed",
      "summary": "3 Electron launch/security/recovery tests passed."
    },
    {
      "command": "pnpm package:dir",
      "result": "passed",
      "summary": "macOS arm64 unpacked application packaged successfully."
    },
    {
      "command": "packaged uiohook lookup and 4-second Kopper.app process smoke",
      "result": "passed",
      "summary": "uiohook_napi.node was under app.asar.unpacked; app remained alive with no fatal/native-hook diagnostics and was cleanly terminated."
    },
    {
      "command": "git diff --check && git diff --cached --name-only",
      "result": "passed",
      "summary": "No whitespace errors and no staged files."
    }
  ],
  "validationOutput": [
    "Vitest: Test Files 54 passed; Tests 448 passed.",
    "Playwright: 3 passed.",
    "electron-builder: packaged platform=darwin arch=arm64 to dist/mac-arm64.",
    "Native module: app.asar.unpacked/node_modules/uiohook-napi/build/Release/uiohook_napi.node.",
    "Packaged launch smoke stayed alive for 4s with no fatal/native-hook diagnostics.",
    "No smoke process or temporary smoke directory remained."
  ],
  "residualRisks": [
    "Manual macOS 14+ Accessibility, cross-application focus/capture, status-item, Dock, secure-input, and permission-revocation validation remains.",
    "Package is unsigned and uses the default Electron app icon.",
    "Build emits existing non-fatal Radix use-client warnings."
  ],
  "noStagedFiles": true,
  "diffSummary": "Replaced createMainWindow with a tested WindowManager; added ShortcutManager and rollback-aware PreferenceService; expanded domain/IPC/preload/runtime composition; added controlled Shortcut Settings and menu-driven settings opening; migrated and expanded integration tests.",
  "reviewFindings": [
    "no blockers found in implementation self-review; independent review gate remains required"
  ],
  "manualNotes": "No commit was created. The complete report is at the runtime-authoritative artifact path."
}
```

## Integration classification and command evidence

- Classification: scoped Task 5 implementation; the tracked changes, deletions, and eight new source/test files exactly matched the implementation report, with no unrelated or prior-session changes found.
- Focused verification: `pnpm vitest run src/main/window/windowManager.test.ts src/main/shortcuts/shortcutManager.test.ts src/main/preferences/preferenceService.test.ts src/main/capture/captureRuntime.test.ts src/main/domain/commandService.test.ts src/main/files/documentFiles.test.ts src/main/ipc/registerIpcHandlers.test.ts src/preload/index.test.ts src/renderer/src/features/settings/ShortcutSettings.test.tsx src/renderer/src/app/App.test.tsx` passed: 10 files, 114 tests.
- Type verification: `pnpm typecheck` passed with no diagnostics.
- Diff verification: `git diff --check` passed before staging.
- Integration disposition: accepted for commit as `feat: add floating panel and custom shortcuts`.
