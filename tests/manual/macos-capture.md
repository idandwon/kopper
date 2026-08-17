# Physical macOS release acceptance procedure

This procedure is a **required, manual release gate** for a protected, signed, notarized Kopper DMG. An unsigned local package cannot satisfy it. Run every step on a physical Mac running macOS 14 or newer, from a newly created local standard account with no prior Kopper installation, data, Accessibility grant, login item, or running process.

Record results in a copy of `docs/releases/acceptance-template.md`. Every row must be `Pass`, `Fail`, or `Not run`; a release is incomplete while any required row is `Fail` or `Not run`.

## 1. Evidence rules and setup

1. Obtain only these two assets from the protected GitHub Release for the exact tag under test:
   - `~/Downloads/Kopper-<version>-universal.dmg`
   - `~/Downloads/Kopper-<version>-universal.dmg.sha256`
2. Record the release URL, tag, package version, full commit SHA, download time (UTC), tester, Mac model, CPU architecture, and macOS product/build version. Do not record account names, credential values, note contents other than the inert test strings below, or unrelated clipboard contents.
3. Paste only bounded output into the acceptance record: command, exit status, and at most 20 relevant output lines. Redact account names and home-directory prefixes. Never paste environment dumps, signing credentials, complete CI logs, or arbitrary clipboard/store contents.
4. Use a version shell variable and verify the files exist:

```bash
VERSION="0.1.0" # replace with the exact package version under test
DMG="$HOME/Downloads/Kopper-${VERSION}-universal.dmg"
CHECKSUM="$DMG.sha256"
test -f "$DMG" && test -f "$CHECKSUM"
```

1. Record machine and artifact metadata:

```bash
sw_vers
uname -m
/usr/sbin/sysctl -n hw.model
/usr/sbin/sysctl -n hw.machine
shasum -a 256 "$DMG"
```

## 2. Verify the protected DMG and install

From the directory containing both published files, verify the published checksum. The checksum file must name the exact DMG; do not copy a checksum from a web page by hand.

```bash
cd "$HOME/Downloads"
shasum -a 256 -c "Kopper-${VERSION}-universal.dmg.sha256"
```

Expected: `Kopper-<version>-universal.dmg: OK` and exit 0.

Validate the DMG's notarization ticket and Gatekeeper assessment before mounting:

```bash
xcrun stapler validate "$DMG"
spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG"
```

Expected: both exit 0; Gatekeeper identifies an accepted notarized Developer ID artifact. Record the bounded output without team identifiers if the release policy treats them as protected.

Open the DMG in Finder, drag **Kopper.app** to **Applications**, eject the DMG, and confirm the installed target is exactly `/Applications/Kopper.app`. Do not assess a build-directory app or an app run from the mounted DMG.

```bash
test -d /Applications/Kopper.app
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' /Applications/Kopper.app/Contents/Info.plist
/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' /Applications/Kopper.app/Contents/Info.plist
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' /Applications/Kopper.app/Contents/Info.plist
/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' /Applications/Kopper.app/Contents/Info.plist
```

Expected: tested version, expected build version, `com.kopper.app`, and `14.0`.

## 3. Signing, notarization, Gatekeeper, and universal slices

Run every command against the installed app:

```bash
spctl --assess --type execute --verbose=4 /Applications/Kopper.app
codesign --verify --deep --strict --verbose=4 /Applications/Kopper.app
xcrun stapler validate /Applications/Kopper.app
codesign -d --verbose=4 /Applications/Kopper.app 2>&1 | sed -n '1,20p'
```

Expected: all validation commands exit 0; Gatekeeper accepts the app, strict deep signature verification reports no failure, and stapler finds a valid ticket.

Verify both architecture slices independently for the main executable and the runtime native module (the two checks are both required):

```bash
lipo -archs /Applications/Kopper.app/Contents/MacOS/Kopper
lipo -archs /Applications/Kopper.app/Contents/Resources/app.asar.unpacked/node_modules/uiohook-napi/build/Release/uiohook_napi.node
```

Expected for each: output includes both `arm64` and `x86_64`.

## 4. First launch and Accessibility onboarding

1. In Finder, launch `/Applications/Kopper.app`. Confirm it opens normally without a Gatekeeper bypass, quarantine removal, or right-click override.
2. Confirm the first-run screen explains that Accessibility is used to notice configured shortcuts and copy only explicitly captured text.
3. Select **Enable Capture**. If macOS does not grant access, select **Open System Settings**, enable Kopper under **Privacy & Security > Accessibility**, return to Kopper, and select **Check again**.
4. Confirm the UI reaches the notes panel only after the grant is detected. Record whether a relaunch was required.
5. Confirm Kopper appears in the Dock while running, has the expected app icon/name, and has no menu-bar status item unless the product UI explicitly documents one. Confirm no unexpected login-item prompt appears.

Do not use **Continue without capture** for the capture matrices.

## 5. Prepare deterministic source and clipboard fixtures

Use only inert fixtures. In each source application, create/open a disposable document containing this exact selected text, including line break and punctuation:

```text
Kopper capture αβ 0123456789
second line: []{} — END
```

Prepare these prior clipboard fixtures and record which representation is under test:

- **Plain text:** `Kopper prior clipboard plain αβ`.
- **Rich text:** in TextEdit rich-text mode, copy bold `Kopper prior rich` plus italic `clipboard` and a blue word.
- **Image plus text:** in a disposable rich TextEdit document, copy one small inert image together with adjacent text `Kopper image+text clipboard`.
- **App-specific custom type:** use a disposable source that declares an additional custom pasteboard type, if available. Kopper promises restoration only for supported representations. Loss of an unsupported custom type is an accepted product limitation that must be recorded explicitly; it is never evidence for a `Pass` claim about that custom type.

For plain-text comparisons only, create bounded before/after evidence without printing the clipboard value:

```bash
pbpaste | shasum -a 256
osascript -e 'clipboard info'
```

For rich text and image-plus-text, record `clipboard info` before and after and paste into a second disposable rich TextEdit document after capture. Pass only if the supported representations, formatting, image, text, and order are restored. Close the evidence document without saving.

## 6. Source application capture matrix

For **each** row below, first put the plain-text prior fixture on the clipboard, then:

1. Activate the named source application and select exactly the two-line capture fixture. Leave the selection active.
2. Record the exact source application identity from the active macOS menu and its version. This is the before-capture focus identity.
3. Press Shift twice within the configured recognition interval; do not click Kopper.
4. Confirm the same named source remains frontmost in the macOS menu after capture. Press Right Arrow, type a harmless marker in the source, then undo the marker to prove keyboard focus remained there without replacing the selected fixture. Record that named app as the after-capture focus identity.
5. Open Kopper using `Cmd+Shift+Space` and confirm exactly one new note contains the selected text byte-for-byte, with no trimming, transformation, duplication, or extra clipboard text.
6. Confirm the non-activating capture acknowledgement appeared when observable.
7. Confirm the prior plain clipboard hash and declared representations match the pre-capture evidence, then delete the captured test note before the next row.

Required sources:

| ID | Source and disposable fixture |
| --- | --- |
| APP-01 | Google Chrome, local/offline editable page or text area |
| APP-02 | ChatGPT macOS application, disposable draft composer |
| APP-03 | Claude macOS application, disposable draft composer |
| APP-04 | Cursor, unsaved plain-text editor tab |
| APP-05 | TextEdit, unsaved plain-text document |
| APP-06 | One additional native text app: Apple Notes, in a disposable local note |

Do not substitute browser tabs for the required ChatGPT, Claude, or Cursor application rows. Record application name and exact tested version in the acceptance record.

## 7. Clipboard, failure, concurrency, and focus matrix

Use TextEdit unless a row names another source. For every row, verify source focus after capture, note count/body, acknowledgement/error, and restoration of every supported prior clipboard representation.

| ID | Physical case and expected outcome |
| --- | --- |
| CLIP-01 | Prior clipboard is plain text; exact selected fixture becomes one note; prior clipboard is restored byte-for-byte. |
| CLIP-02 | Prior clipboard is rich text; selected plain text becomes one note; prior rich formatting/text is restored. |
| CLIP-03 | Prior clipboard contains image plus text; selected text becomes one note; image and text representations are restored. |
| CLIP-04 | Empty selection; no note is created; “Nothing selected” (or equivalent) appears; clipboard is unchanged. |
| CLIP-05 | Selected text is exactly equal to prior clipboard text; exactly one note is created despite equal text; clipboard remains unchanged. |
| CLIP-06 | Whitespace-only selection; no note is created and clipboard is restored. |
| CLIP-07 | Secure input/protected password field is active; no note is created, protected content is never shown, failure is reported, clipboard is restored. |
| CLIP-08 | Revoke Kopper in System Settings > Privacy & Security > Accessibility while it runs, return to the source, invoke capture; no note is created, onboarding/denial is shown, clipboard is restored. Quit and relaunch while still revoked and confirm capture remains denied/onboarding remains available. Re-enable, relaunch if macOS requires it, and use Check again before later rows. |
| CLIP-09 | Select the fixture, invoke capture, and immediately close the disposable source window/application before copy completes; no partial/incorrect note is created, failure is bounded, clipboard is restored. |
| CLIP-10 | Invoke two rapid double-Shift gestures while one capture is in progress; transactions serialize, notes are not corrupted or unpredictably duplicated, and the original clipboard is restored after both settle. Record exact observed note count. |
| CLIP-11 | Invoke capture while a Kopper editor selection is active; one note is created from the selection without recursive capture; clipboard is restored. |
| CLIP-12 | Use a source that cannot provide selectable text (for example an inert image); no note is created, failure is reported, clipboard is restored. |
| CLIP-13 | Start with a clipboard that includes an app-specific custom pasteboard type. Record `clipboard info` before/after and the supported types restored. If the custom type is unsupported and lost, record the accepted limitation explicitly; do not mark restoration of that custom type Pass. |

For CLIP-07, use a disposable password field containing a non-secret test string. Never test with a real password. For CLIP-09 and CLIP-10, repeat three times; any intermittent focus, clipboard, or note-count failure is a `Fail`, not a pass after retry.

## 8. Notes, sections, completed, and keyboard workflows

Use disposable content. Check both pointer and keyboard paths where listed and confirm every acknowledged change survives a quit/relaunch unless the row is explicitly session-only undo.

| ID | Required workflow |
| --- | --- |
| NOTE-01 | Add notes through the composer, including multiline Markdown; edit inline; save with `Cmd+Return`; cancel/discard without losing prior saved text. |
| NOTE-02 | Open expanded editing and **Edit in new window**; edit/save; close the editor window without quitting the main app. |
| NOTE-03 | Search active notes with pointer and `Cmd+K`; confirm active and completed results are correct and clearing search restores ordering. |
| NOTE-04 | Navigate cards by keyboard; confirm visible focus is distinct from selection. |
| NOTE-05 | Cmd-click toggles individual notes; Shift-click extends a range in displayed order. |
| NOTE-06 | `Cmd+C` and context-menu **Copy** preserve selected note content/order. |
| NOTE-07 | `Shift+Cmd+C` and **Copy as list** emit one Markdown list item per selected note in displayed order. |
| NOTE-08 | Merge selected notes with `Shift+Cmd+M` and context menu; body order/newlines are correct; Undo restores; repeat and retain the merge. |
| NOTE-09 | Delete selected notes with Delete and context menu; Undo restores during the session; acknowledged deletion persists after relaunch. |
| NOTE-10 | Complete selected notes with Space/button/context menu; completion timestamp/order behavior is visible; Completed search finds them. |
| NOTE-11 | Restore completed notes to their previous section/order; after deleting that section, restore another completed note to the first available section. |
| NOTE-12 | Move notes between sections with keyboard-accessible and pointer context menus; order and persistence are correct. |
| NOTE-13 | Context menus expose only applicable actions: Copy, Copy as list, Mark done/Restore, Expand, Edit, Edit in new window, Merge, Move, Delete. |
| NOTE-14 | Trigger a destructive action and a recoverable save failure if a safe fixture is available; UI does not imply success before persistence and offers Retry without losing edits. |

| ID | Required section workflow |
| --- | --- |
| SECT-01 | Create and rename sections; reject an invalid/empty name without changing the prior value. |
| SECT-02 | Reorder sections and confirm explicit ordering survives relaunch. |
| SECT-03 | Move notes into another section through pointer and keyboard paths. |
| SECT-04 | Delete an empty section. |
| SECT-05 | Delete a non-empty section by choosing another destination; verify notes move correctly. |
| SECT-06 | Delete a non-empty section by explicitly deleting its notes; verify confirmation and session undo behavior where offered. |

## 9. Shortcut, window, persistence, data, recovery, and theme workflows

| ID | Required shortcut/window workflow |
| --- | --- |
| WIN-01 | `Cmd+Shift+Space` shows and hides the panel; hiding does not quit. The panel opens near the active display's right edge. |
| WIN-02 | Resize to allowed minimum and larger sizes, move across displays/workspaces, quit/relaunch, and verify clamped saved bounds. |
| WIN-03 | Enable and disable pin/always-on-top; verify behavior against another window and persistence. |
| WIN-04 | Closing the panel hides it; the show/hide shortcut restores it. **Quit Kopper** exits instead of hiding. |
| WIN-05 | Capture acknowledgement is non-activating; opening/hiding the panel restores focus predictably. |
| WIN-06 | Main and expanded editor windows share the active theme; editor closure does not close the main window. |
| SHORT-01 | Verify defaults: Shift Shift capture, `Cmd+Shift+Space` show/hide, `Cmd+K` search, Return edit, `Cmd+Return` save, Space complete, `Cmd+C` copy, `Shift+Cmd+C` copy list, `Shift+Cmd+M` merge, Delete delete. |
| SHORT-02 | Save valid custom capture and show/hide shortcuts; verify both work globally and persist after relaunch. |
| SHORT-03 | Enter invalid and conflicting shortcuts; verify a specific explanation and preservation of the last valid configuration. |
| SHORT-04 | Press Shift twice outside the interval and Shift-other-key-Shift; neither triggers capture. |

| ID | Required data/recovery workflow |
| --- | --- |
| DATA-01 | Confirm the active path is `~/Library/Application Support/Kopper/kopper.json` and normal use creates one transparent versioned JSON document, not silent backups. |
| DATA-02 | Export valid data, change active data, cancel an import, and verify active data is unchanged. |
| DATA-03 | Import the valid export, inspect preview/confirmation, replace data, and verify notes, sections, preferences, and ordering. |
| DATA-04 | Present malformed JSON; verify original bytes are not overwritten, export damaged bytes unchanged, and cancel **Create new store** without mutation. |
| DATA-05 | Explicitly confirm **Create new store**, then import a valid store; verify unsupported newer schema remains read-only/recoverable rather than overwritten. |
| DATA-06 | Leave an editor draft, quit/relaunch, and verify the single persisted draft; save or explicitly discard and verify it clears only then. |

| ID | Required appearance/theme workflow |
| --- | --- |
| THEME-01 | Select System, Light, and Dark; verify System follows a live macOS appearance change and all app windows update. |
| THEME-02 | Activate every bundled preset (Oxide Ledger, Night Workshop, Index Drawer) in both usable appearance modes. |
| THEME-03 | Edit every exposed semantic color token and radius; verify live preview across representative controls/cards/dialogs and lifecycle states. |
| THEME-04 | Enter invalid syntax/unsupported color and a failing contrast pair; validation blocks save and leaves the active theme unchanged. |
| THEME-05 | Save a valid custom theme; reset one token, then reset the complete theme; verify each scope. |
| THEME-06 | Export versioned shadcn-compatible JSON; import it, Preview, Cancel, and confirm exact visual rollback. |
| THEME-07 | Import again, Preview, Save, and confirm activation and persistence after relaunch. Verify missing lifecycle tokens derive deterministically when using a compatible fixture. |
| THEME-08 | Enable Reduce Motion in macOS; verify capture, insertion, and completion use immediate layout/opacity feedback without translation/collapse motion, and visible status does not rely on color alone. |

## 10. Security and privacy observations

| ID | Required observation |
| --- | --- |
| SEC-01 | Airplane/offline mode does not prevent local notes, search, themes, export, or other non-capture workflows; no account/login is requested. |
| SEC-02 | No telemetry, analytics, crash-reporting, sync, update, or remote-content UI appears. No test note is sent to another service. |
| SEC-03 | Accessibility denial/revocation is explicit and recoverable; capture is unavailable while denied. |
| SEC-04 | Secure-input test content never appears in a note, acknowledgement, log, exported data, or clipboard restoration evidence. |
| SEC-05 | Imported malformed data/theme is validated and cannot silently replace active state. |
| SEC-06 | Gatekeeper launch succeeds without disabling security controls, removing quarantine, or using an override. |

## 11. Process exit and uninstall

First test normal quit while the app is installed:

1. Hide and show the panel once.
2. Use the application menu's **Quit Kopper** action (not just the panel close button).
3. Wait five seconds, then run:

```bash
pgrep -ifl Kopper || true
pgrep -ifl 'com\.kopper\.app' || true
```

Expected: no Kopper or Kopper Helper process. Record any output as `Fail` until explained and retested from a fixed build.

Uninstall:

1. Ensure Kopper is quit.
2. Remove only `/Applications/Kopper.app` (Finder Trash or `rm -rf /Applications/Kopper.app` with appropriate authorization).
3. Log out and back into the clean test account.
4. Confirm absence of processes, app-owned launch agents, privileged helpers, and login items:

```bash
pgrep -ifl Kopper || true
pgrep -ifl 'com\.kopper\.app' || true
find "$HOME/Library/LaunchAgents" /Library/LaunchAgents /Library/LaunchDaemons \
  -maxdepth 1 \( -iname '*kopper*' -o -iname '*com.kopper.app*' \) -print 2>/dev/null
find /Library/PrivilegedHelperTools -maxdepth 1 \
  \( -iname '*kopper*' -o -iname '*com.kopper.app*' \) -print 2>/dev/null
/usr/bin/osascript -e 'tell application "System Events" to get the name of every login item whose name contains "Kopper"'
test ! -e /Applications/Kopper.app
```

Expected: the searches produce no path, login-item output is empty, the final command exits 0, and System Settings > General > Login Items contains no Kopper entry.

The local data file may remain after app removal because it is user content, not a background component. Record whether it remains. If cleanup of the disposable account is approved, remove only `~/Library/Application Support/Kopper` after evidence is complete.

## 12. Failures, retests, and release decision

- A surprising or intermittent outcome is `Fail`, not `Not run`.
- `Not run` is allowed only with an explicit blocker and required next action.
- Preserve the first failure evidence. Retest on a newly produced artifact and append a new dated retest row; never overwrite the failure.
- Record residual risks even after a successful retest.
- The tested checksum, tag, commit, version, app versions, and machine must identify one immutable release candidate.
- Do not publish, promote, or describe the release as complete while any signing, notarization, protected-artifact, physical, process, or uninstall row is `Fail` or `Not run`.
