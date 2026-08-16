# Kopper macOS Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add permission-safe global double-Shift capture, clipboard-preserving selected-text acquisition, customizable global shortcuts, and polished floating-window behavior on macOS.

**Architecture:** Pure recognizers and capture orchestration depend on narrow ports. The production adapters use Electron system preferences, `uiohook-napi`, a fixed JXA script executed by `osascript`, Electron clipboard, and BrowserWindow; adapters start only after Accessibility trust is confirmed.

**Tech Stack:** Electron, TypeScript, React, uiohook-napi, Zod, shadcn/ui, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-08-16-kopper-design.md`

## Global Constraints

- Complete the foundation, note-workflow, and theme plans first.
- Target macOS 14 Sonoma and later; do not add a custom Swift helper.
- Never start `uiohook-napi` before Accessibility permission is granted.
- Double-Shift capture must not activate Kopper or steal focus from the source application.
- Always restore supported prior clipboard representations after success, empty selection, timeout, or source failure.
- Serialize capture transactions; overlapping clipboard snapshots are forbidden.
- Static JXA source may not contain captured text, note text, shortcut text, or any other user interpolation.
- Use test-driven development and commit after every task.

---

## Locked File Structure

```text
src/main/permissions/permissionManager.ts       Accessibility trust adapter
src/shared/permissions/permissionState.ts       Permission state type
src/main/shortcuts/doubleShiftRecognizer.ts     Pure modifier-sequence state machine
src/main/shortcuts/globalKeyboardMonitor.ts      uiohook-napi lifecycle adapter
src/main/shortcuts/shortcutManager.ts            Capture and panel shortcut orchestration
src/main/capture/clipboardSnapshot.ts            Supported clipboard snapshot and restore
src/main/capture/selectionScript.ts              Fixed JXA copy-and-change-count script
src/main/capture/selectionCapture.ts             Selection transaction
src/main/capture/captureCoordinator.ts           Serialized capture-to-note flow
src/main/window/windowManager.ts                 Floating panel placement and activation behavior
src/shared/domain/commands.ts                    Shortcut preference commands
src/shared/ipc/contract.ts                       Permission, shortcut, window, and capture events
src/main/ipc/registerIpcHandlers.ts               macOS integration handlers
src/preload/index.ts                              macOS integration bridge
src/renderer/src/features/onboarding/*           Accessibility onboarding
src/renderer/src/features/settings/ShortcutSettings.tsx Shortcut editing
src/renderer/src/features/capture/CaptureToast.tsx Non-activating acknowledgments
```

## Task 1: Add Accessibility Permission State and Onboarding

**Files:**

- Create: `src/shared/permissions/permissionState.test.ts`
- Create: `src/shared/permissions/permissionState.ts`
- Create: `src/main/permissions/permissionManager.test.ts`
- Create: `src/main/permissions/permissionManager.ts`
- Modify: `src/shared/ipc/contract.ts`
- Modify: `src/main/ipc/registerIpcHandlers.ts`
- Modify: `src/preload/index.ts`
- Create: `src/renderer/src/features/onboarding/AccessibilityOnboarding.test.tsx`
- Create: `src/renderer/src/features/onboarding/AccessibilityOnboarding.tsx`
- Modify: `src/renderer/src/app/App.tsx`

**Interfaces:**

- Consumes: Electron `systemPreferences`, `shell`, and typed IPC infrastructure.
- Produces: `PermissionState`, `PermissionManager.check(prompt): PermissionState`, `PermissionManager.openSettings()`, `window.kopper.getAccessibilityPermission(prompt)`, and `window.kopper.openAccessibilitySettings()`.

- [ ] **Step 1: Write failing permission-state tests**

Define:

```ts
export type PermissionState = "unknown" | "granted" | "denied" | "restricted";
```

Test `mapAccessibilityTrust({ platform, trusted, prompted })`: non-darwin is `restricted`; trusted darwin is `granted`; untrusted without a request is `unknown`; untrusted after a request is `denied`.

- [ ] **Step 2: Run permission tests and verify failure**

Run: `pnpm vitest run src/shared/permissions src/main/permissions`

Expected: FAIL because permission modules do not exist.

- [ ] **Step 3: Implement `PermissionManager`**

Inject adapters for testability. Production `check(prompt)` calls `systemPreferences.isTrustedAccessibilityClient(prompt)` only on darwin. `openSettings()` calls:

```ts
shell.openExternal(
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
);
```

No global monitor starts from this class.

- [ ] **Step 4: Extend IPC and preload**

Add permission get/open methods and a `kopper:permission:changed` subscription. Poll permission every 750 ms only while the onboarding screen is visible, stop after grant or unmount, and do not poll in the background.

- [ ] **Step 5: Write failing onboarding tests**

Assert the screen explains that Kopper reads a selection only after a configured shortcut, offers “Open System Settings,” “Check again,” and “Continue without capture,” and announces denial with an alert. Continuing without capture must open the normal note interface while leaving global monitoring disabled.

- [ ] **Step 6: Implement onboarding**

Use exact primary copy: “Kopper needs Accessibility access to notice its shortcuts and copy text you explicitly capture.” The Check again action calls `getAccessibilityPermission(false)`. The Enable Capture action calls it with `true` so macOS may show its native prompt. Continue without capture records no false grant; it dismisses onboarding for the session and keeps capture controls visibly unavailable until permission changes.

- [ ] **Step 7: Run permission and onboarding tests**

Run:

```bash
pnpm vitest run src/shared/permissions src/main/permissions src/renderer/src/features/onboarding
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit permission onboarding**

```bash
git add src/shared/permissions src/main/permissions src/shared/ipc src/main/ipc src/preload src/renderer/src/features/onboarding src/renderer/src/app/App.tsx
 git commit -m "feat: add Accessibility permission onboarding"
```

## Task 2: Recognize Double-Shift and Manage the Global Hook

**Files:**

- Create: `src/main/shortcuts/doubleShiftRecognizer.test.ts`
- Create: `src/main/shortcuts/doubleShiftRecognizer.ts`
- Create: `src/main/shortcuts/globalKeyboardMonitor.test.ts`
- Create: `src/main/shortcuts/globalKeyboardMonitor.ts`
- Modify: `package.json`
- Modify: `electron-builder.yml`

**Interfaces:**

- Consumes: permission state and `uiohook-napi` keyboard events.
- Produces: `DoubleShiftRecognizer.feed(event): "capture" | null`, `DoubleShiftRecognizer.reset()`, and `GlobalKeyboardMonitor.start()/stop()`.

- [ ] **Step 1: Write failing recognizer tests with a fake clock**

Use normalized events:

```ts
interface ModifierEvent {
  type: "down" | "up";
  key: "shift-left" | "shift-right" | "other";
  at: number;
}
```

Test two complete Shift taps within 400 ms emit one capture; held key repeat does not count; another key cancels; 401 ms cancels; left then right Shift is accepted; three taps emit only one capture until all Shift keys are up; and `reset()` clears partial state.

- [ ] **Step 2: Run recognizer tests and verify failure**

Run: `pnpm vitest run src/main/shortcuts/doubleShiftRecognizer.test.ts`

Expected: FAIL because the recognizer does not exist.

- [ ] **Step 3: Implement the pure recognizer**

Count a tap only on an up event that follows its own down event without another key. After emission, enter a consumed state until both Shift keys are up. Do not read wall-clock time internally; use `event.at`.

- [ ] **Step 4: Install `uiohook-napi` and write failing adapter tests**

Run: `pnpm add uiohook-napi`

Use a fake hook emitter. Assert `start()` subscribes to keydown/keyup before calling hook start, maps `UiohookKey.Shift` and `UiohookKey.ShiftRight`, maps every other code to `other`, catches startup errors as structured `permission_denied`, and `stop()` unsubscribes and calls hook stop exactly once.

- [ ] **Step 5: Implement `GlobalKeyboardMonitor`**

Import `uIOhook` and `UiohookKey` only inside the production adapter factory after permission is granted. Forward `performance.now()` timestamps to the recognizer. Publish capture intent through an injected callback; never import repository or window modules here.

- [ ] **Step 6: Configure native dependency packaging**

Ensure `electron-builder.yml` includes:

```yaml
asarUnpack:
  - node_modules/uiohook-napi/**
npmRebuild: true
```

Add `postinstall: electron-builder install-app-deps` to `package.json` so the native module matches the Electron ABI.

- [ ] **Step 7: Run shortcut and build checks**

Run:

```bash
pnpm vitest run src/main/shortcuts
pnpm typecheck
pnpm build
pnpm package:dir
```

Expected: PASS and the unpacked application contains the uiohook native binary outside ASAR.

- [ ] **Step 8: Commit the global keyboard monitor**

```bash
git add src/main/shortcuts package.json pnpm-lock.yaml electron-builder.yml
 git commit -m "feat: recognize global double Shift"
```

## Task 3: Capture Selection While Preserving the Clipboard

**Files:**

- Create: `src/main/capture/clipboardSnapshot.test.ts`
- Create: `src/main/capture/clipboardSnapshot.ts`
- Create: `src/main/capture/selectionScript.test.ts`
- Create: `src/main/capture/selectionScript.ts`
- Create: `src/main/capture/selectionCapture.test.ts`
- Create: `src/main/capture/selectionCapture.ts`

**Interfaces:**

- Consumes: Electron clipboard, Node `execFile`, and structured capture errors.
- Produces: `snapshotClipboard(clipboard): ClipboardSnapshot`, `restoreClipboard(clipboard, snapshot)`, static `SELECTION_CAPTURE_JXA`, and `SelectionCapture.capture(): Promise<Result<string, KopperError>>`.

- [ ] **Step 1: Write failing clipboard snapshot tests**

Cover text, HTML, RTF, bookmark title/URL, and image. Assert restore writes one combined object so supported representations coexist. Assert an empty clipboard restores as empty. Model only Electron-supported representations and document that source-app Cmd+C may replace custom pasteboard formats Electron cannot read or restore.

- [ ] **Step 2: Implement snapshot and restore**

Use Electron `clipboard.readText`, `readHTML`, `readRTF`, `readBookmark`, and `readImage`. Clone image bytes with `toPNG()` and rebuild with `nativeImage.createFromBuffer`. Restore with one `clipboard.write({ text, html, rtf, bookmark: bookmark.title, image })` call; when a bookmark exists, its URL is the restored `text` value as required by Electron’s clipboard API.

- [ ] **Step 3: Write a failing static-script safety test**

Assert `SELECTION_CAPTURE_JXA` contains no interpolation markers, reads `NSPasteboard.generalPasteboard.changeCount`, asks System Events to press Command+C, waits no longer than 600 ms, and prints exactly `changed` or `timeout`.

- [ ] **Step 4: Implement the fixed JXA script**

Use `osascript -l JavaScript -e SELECTION_CAPTURE_JXA`. The script records pasteboard change count, sends `Application("System Events").keystroke("c", { using: "command down" })`, polls with `delay(0.02)` for at most 30 iterations, and writes `changed` on advancement or `timeout` otherwise. The script source is a module-level constant with no string interpolation.

- [ ] **Step 5: Write failing selection transaction tests**

Assert:

```ts
it.each(["success", "timeout", "empty", "exec-failure"])(
  "restores the clipboard after %s",
  async (scenario) => {
    const before = makeClipboardSnapshot();
    await makeCapture(scenario).capture();
    expect(restore).toHaveBeenCalledWith(before);
  },
);
```

Success returns exact text including internal whitespace. Whitespace-only text returns `nothing_selected`. Timeout returns `capture_timeout`. Concurrent calls are not handled here; serialization belongs to `CaptureCoordinator`.

- [ ] **Step 6: Implement `SelectionCapture`**

Take the snapshot, run the static script with `execFile`, read text only after `changed`, and restore in `finally`. Set `timeout: 1000`, `windowsHide: true`, and `maxBuffer: 4096`. Do not invoke a shell. Normalize only the script’s trailing newline, not captured content.

- [ ] **Step 7: Run capture transaction tests**

Run:

```bash
pnpm vitest run src/main/capture/clipboardSnapshot.test.ts src/main/capture/selectionScript.test.ts src/main/capture/selectionCapture.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit selected-text capture**

```bash
git add src/main/capture
 git commit -m "feat: capture selected text without consuming clipboard"
```

## Task 4: Serialize Capture Into Notes and Acknowledge Outcomes

**Files:**

- Create: `src/main/capture/captureCoordinator.test.ts`
- Create: `src/main/capture/captureCoordinator.ts`
- Modify: `src/shared/ipc/contract.ts`
- Modify: `src/main/ipc/registerIpcHandlers.ts`
- Modify: `src/preload/index.ts`
- Create: `src/renderer/src/features/capture/CaptureToast.test.tsx`
- Create: `src/renderer/src/features/capture/CaptureToast.tsx`
- Modify: `src/renderer/src/app/App.tsx`

**Interfaces:**

- Consumes: `SelectionCapture`, `CommandService`, active section from repository, and renderer event publication.
- Produces: `CaptureCoordinator.requestCapture(): Promise<CaptureOutcome>` and `window.kopper.onCaptureOutcome(listener)`.

- [ ] **Step 1: Write failing coordinator tests**

Assert two simultaneous requests run selection capture sequentially. Success generates one UUID, sends it as `note.add.id` with the current `activeSectionId`, and publishes `{ status: "captured", noteId }` with that same UUID only after persistence. Empty selection publishes `{ status: "empty" }`. Timeout and denied permission publish structured failure without commands. A failed `note.add` publishes the persistence error.

- [ ] **Step 2: Implement the serialized coordinator**

Use a promise chain that recovers after rejection so one failed capture cannot block later captures. Resolve the active section immediately before executing `note.add`, not when the shortcut was first observed.

- [ ] **Step 3: Extend capture outcome events**

Define and validate:

```ts
type CaptureOutcome =
  | { status: "captured"; noteId: string }
  | { status: "empty" }
  | { status: "failed"; error: KopperError };
```

Expose a subscription only; renderer code cannot call capture directly until a Settings “Test capture” action is added in Task 5.

- [ ] **Step 4: Write failing acknowledgment tests**

Assert captured text displays “Captured,” empty displays “Nothing selected,” timeout displays “The source app did not provide text,” the acknowledgment is an ARIA status rather than an alert for nonfatal outcomes, and it dismisses after 1800 ms. New-note highlighting clears after the same duration.

- [ ] **Step 5: Implement capture acknowledgment**

Use one motion sequence: translate and fade for normal motion, opacity only under Reduced Motion. The renderer must not focus the toast, play sound, or request window activation.

- [ ] **Step 6: Compose the permission-gated monitor and coordinator**

In the main composition root, start the global monitor only after permission becomes granted. Stop it before app quit. Feed recognizer capture intent into `CaptureCoordinator.requestCapture` and log no note content in success or failure paths.

- [ ] **Step 7: Run capture orchestration tests**

Run:

```bash
pnpm vitest run src/main/capture src/renderer/src/features/capture
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 8: Commit capture orchestration**

```bash
git add src/main/capture src/shared/ipc src/main/ipc src/preload src/renderer/src/features/capture src/renderer/src/app/App.tsx src/main/index.ts
 git commit -m "feat: capture selections into active section"
```

## Task 5: Add Floating Window and Custom Shortcut Settings

**Files:**

- Create: `src/main/window/windowManager.test.ts`
- Create: `src/main/window/windowManager.ts`
- Delete: `src/main/createMainWindow.ts`
- Create: `src/main/shortcuts/shortcutManager.test.ts`
- Create: `src/main/shortcuts/shortcutManager.ts`
- Modify: `src/shared/domain/document.ts`
- Modify: `src/shared/domain/commands.test.ts`
- Modify: `src/shared/domain/commands.ts`
- Modify: `src/shared/ipc/contract.ts`
- Modify: `src/main/ipc/registerIpcHandlers.ts`
- Modify: `src/preload/index.ts`
- Create: `src/renderer/src/features/settings/ShortcutSettings.test.tsx`
- Create: `src/renderer/src/features/settings/ShortcutSettings.tsx`
- Modify: `src/renderer/src/features/settings/AppearanceSettings.tsx`
- Modify: `src/main/index.ts`

**Interfaces:**

- Consumes: Electron BrowserWindow, screen, globalShortcut, permission-gated monitor, and persisted preferences.
- Produces: `WindowManager`, `ShortcutManager.apply(preferences)`, shortcut preference commands, and complete shortcut/window settings UI.

- [ ] **Step 1: Write failing window-manager tests**

With BrowserWindow and screen fakes, assert initial 380 × 640 size, minimum 340 × 480, 24 px right-edge inset on the active display, clamping to work area, remembered bounds only when still visible, `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`, pinning through `setAlwaysOnTop`, show/hide toggle, show-inactive acknowledgment behavior, and focus restoration to the previously active app on hide.

- [ ] **Step 2: Implement `WindowManager`**

Create the secure BrowserWindow options formerly in `createMainWindow`. Keep the application running when the panel closes by converting close to hide unless `app.isQuitting` is true. Do not show a Dock icon after onboarding is complete; expose a menu-bar status item with Open Kopper, Capture Selection, Settings, and Quit.

- [ ] **Step 3: Define shortcut preferences and commands**

Use:

```ts
interface ShortcutPreferences {
  capture:
    | { kind: "double-modifier"; modifier: "shift" }
    | { kind: "accelerator"; accelerator: string };
  togglePanel: string;
}
```

Add `shortcuts.setCapture`, `shortcuts.setTogglePanel`, `window.setPinned`, and `window.setBounds` commands. Defaults remain double-Shift and `CommandOrControl+Shift+Space`.

- [ ] **Step 4: Write failing shortcut-manager tests**

Assert double-Shift starts the monitor and unregisters any capture accelerator; accelerator capture stops the monitor and registers exactly one accelerator; toggle conflicts return `shortcut_conflict`; failed registration keeps prior valid bindings; apply is transactional; and dispose unregisters all global shortcuts and stops the monitor.

- [ ] **Step 5: Implement `ShortcutManager`**

Validate accelerator strings with Electron `globalShortcut.register` return values in an apply/rollback transaction. Keep double-Shift recognition in `GlobalKeyboardMonitor`; use Electron globalShortcut only for conventional accelerators.

- [ ] **Step 6: Write failing settings tests**

Assert users can select Double Shift or Record shortcut, conflicts remain unsaved with an explanation, Reset restores defaults, Test capture invokes a dedicated `requestCapture()` preload method, and pinning updates persisted preference only after the native window operation succeeds.

- [ ] **Step 7: Implement settings and bridge methods**

Add `requestCapture`, shortcut validation, shortcut save, and pin methods to typed IPC. Place Shortcut Settings beside Appearance and Data settings. Recording ignores modifier-only partial sequences except the supported Double Shift choice.

- [ ] **Step 8: Run macOS integration unit verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm package:dir
```

Expected: all commands exit 0.

- [ ] **Step 9: Commit window and shortcut behavior**

```bash
git add src/main/window src/main/shortcuts src/shared/domain src/shared/ipc src/main/ipc src/preload src/renderer/src/features/settings src/main/index.ts
 git commit -m "feat: add floating panel and custom shortcuts"
```

## Milestone Acceptance

On a macOS 14 or newer development machine:

1. Run `pnpm package:dir` and launch the unpacked `.app` from Finder.
2. Grant Accessibility permission through onboarding.
3. Select text in Chrome, ChatGPT, Claude, Cursor, and TextEdit; press Shift twice.
4. Confirm the source app remains active, the exact selection appears in the active Kopper section, and prior text/HTML/image clipboard content is restored.
5. Verify empty selection, secure-input source, timeout, repeated shortcut, alternate accelerator, panel toggle, pinning, and app quit behavior.
6. Revoke Accessibility permission, relaunch, and confirm Kopper shows onboarding and does not start the global hook.
