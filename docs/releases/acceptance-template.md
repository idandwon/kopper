# Kopper v<version> release acceptance

> **Release status: Incomplete — Not run**
>
> This record is evidence, not a release-completion claim. Replace placeholders only with observations from the exact immutable artifact and commit identified below. Required statuses are exactly `Pass`, `Fail`, or `Not run`. Preserve failures and append retests; never turn an unexecuted row into `Pass` based on automation, source inspection, or another artifact.

Procedure: [`tests/manual/macos-capture.md`](../../tests/manual/macos-capture.md)

## Decision and evidence integrity

| Field | Value |
| --- | --- |
| Overall decision | Not run |
| Release complete | No |
| Blocking summary | Not run — protected artifact and required gates have not yet been evidenced |
| Evidence author/tester | Not run |
| Record created (UTC) | Not run |
| Last updated (UTC) | Not run |
| Reviewers | Not run |
| Evidence scope | Not run |
| Evidence integrity note | Not run — state whether automation and physical checks used the same exact release commit/artifact |

### Status rules

- **Pass:** observed on the exact commit/artifact/machine recorded here, with bounded evidence.
- **Fail:** run and did not meet the expected result, including intermittent failures.
- **Not run:** not executed; the Evidence/blocker cell must explain why and state the next action.
- A later successful retest does not erase an earlier failure.
- The release remains incomplete while any required row is `Fail` or `Not run`.

## Immutable source and protected artifact metadata

| Field | Status | Value/evidence |
| --- | --- | --- |
| Package version | Not run | `<version>` |
| Release tag | Not run | `v<version>` |
| Full release commit SHA | Not run | `<40-character SHA>` |
| Commit/tag equality | Not run | bounded `git rev-parse` / exact-tag evidence from protected workflow |
| GitHub Release URL/run ID | Not run | `<URL and run ID>` |
| DMG filename | Not run | `Kopper-<version>-universal.dmg` |
| Published checksum filename | Not run | `Kopper-<version>-universal.dmg.sha256` |
| Published DMG SHA-256 | Not run | `<64 lowercase hex characters>` |
| Downloaded DMG SHA-256 | Not run | bounded `shasum -a 256` output |
| Checksum-file verification | Not run | bounded `shasum -a 256 -c` output |
| Installed app path | Not run | `/Applications/Kopper.app` |
| Expected protected DMG path | Not run | `~/Downloads/Kopper-<version>-universal.dmg` |
| Unsigned/dev artifacts excluded | Not run | confirm no `release/mac-universal/Kopper.app` unsigned build was used for physical/signing claims |

## Machine metadata

| Field | Status | Value/evidence |
| --- | --- | --- |
| Physical Mac model | Not run | bounded `sysctl -n hw.model` output |
| Machine architecture | Not run | bounded `uname -m` and `sysctl -n hw.machine` output |
| macOS version/build | Not run | bounded `sw_vers` output; must be macOS 14+ |
| Clean local account | Not run | confirm no prior app, store, Accessibility grant, login item, or process |
| Source application versions | Not run | record versions in application matrix |
| Test start/end UTC | Not run | `<timestamps>` |

## Bounded command evidence policy

For each command below, record exact command, UTC run time, exit status, and at most 20 relevant output lines. Do not paste secrets, environment dumps, account names, home paths, note/clipboard contents, signing certificates, or complete logs. Redact irrelevant identifiers and say what was redacted.

## Automated release gate

| Command | Status | UTC / tested SHA | Bounded summary or blocker |
| --- | --- | --- | --- |
| `pnpm test` | Not run | Not run | Not run — run on exact release commit |
| `pnpm typecheck` | Not run | Not run | Not run — run on exact release commit |
| `pnpm build` | Not run | Not run | Not run — run on exact release commit |
| `pnpm test:e2e` | Not run | Not run | Not run — run on exact release commit |
| `pnpm audit:deps` | Not run | Not run | Not run — run on exact release commit |
| `pnpm audit:source` | Not run | Not run | Not run — run on exact release commit |
| `pnpm package:unsigned` | Not run | Not run | Not run — optional noncredentialed package gate; never satisfies protected-artifact rows |
| `pnpm verify:package "release/mac-universal/Kopper.app"` | Not run | Not run | Not run — optional unsigned-app verification only |
| `actionlint .github/workflows/*.yml` | Not run | Not run | Not run — run pinned workflow syntax check |
| `pnpm package:release` | Not run | Not run | Not run — run only on clean exact tag in protected credentialed environment |

## Signing, notarization, artifact, and universal package evidence

| ID | Required command/check | Status | Bounded output or blocker |
| --- | --- | --- | --- |
| PKG-01 | `shasum -a 256 -c "Kopper-<version>-universal.dmg.sha256"` | Not run | Not run — protected DMG/checksum required |
| PKG-02 | `xcrun stapler validate "$DMG"` | Not run | Not run — protected DMG required |
| PKG-03 | `spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG"` | Not run | Not run — protected DMG required |
| PKG-04 | App installed from DMG at `/Applications/Kopper.app` on clean account | Not run | Not run — physical installation required |
| PKG-05 | `spctl --assess --type execute --verbose=4 /Applications/Kopper.app` | Not run | Not run — installed protected app required |
| PKG-06 | `codesign --verify --deep --strict --verbose=4 /Applications/Kopper.app` | Not run | Not run — installed protected app required |
| PKG-07 | `xcrun stapler validate /Applications/Kopper.app` | Not run | Not run — installed protected app required |
| PKG-08 | Bounded `codesign -d --verbose=4` metadata | Not run | Not run — installed protected app required |
| PKG-09 | Main executable `lipo -archs /Applications/Kopper.app/Contents/MacOS/Kopper` | Not run | Not run — must show `arm64` and `x86_64` |
| PKG-10 | Native module `lipo -archs /Applications/Kopper.app/Contents/Resources/app.asar.unpacked/node_modules/uiohook-napi/build/Release/uiohook_napi.node` | Not run | Not run — must show `arm64` and `x86_64` |
| PKG-11 | Bundle version, ID, minimum macOS metadata | Not run | Not run — record PlistBuddy output from installed app |
| PKG-12 | Normal Finder launch under Gatekeeper without bypass | Not run | Not run — physical launch required |

## Accessibility onboarding and source application matrix

Exact selected fixture:

```text
Kopper capture αβ 0123456789
second line: []{} — END
```

| ID | Required onboarding/first-launch observation | Status | Evidence/blocker |
| --- | --- | --- | --- |
| ONBOARD-01 | In Finder, launch `/Applications/Kopper.app`. Confirm it opens normally without a Gatekeeper bypass, quarantine removal, or right-click override. | Not run | Not run — protected installed app and physical clean-account onboarding required |
| ONBOARD-02 | Confirm the first-run screen explains that Accessibility is used to notice configured shortcuts and copy only explicitly captured text. | Not run | Not run — protected installed app and physical clean-account onboarding required |
| ONBOARD-03 | Select **Enable Capture**. If macOS does not grant access, select **Open System Settings**, enable Kopper under **Privacy & Security > Accessibility**, return to Kopper, and select **Check again**. | Not run | Not run — protected installed app and physical clean-account onboarding required |
| ONBOARD-04 | Confirm the UI reaches the notes panel only after the grant is detected. | Not run | Not run — protected installed app and physical clean-account onboarding required |
| ONBOARD-05 | Record whether the Accessibility grant required relaunching Kopper: **Yes** or **No**. | Not run | Not run — record Yes or No during physical clean-account onboarding |
| ONBOARD-06 | Confirm Kopper is visible in the Dock with the expected app icon/name during onboarding. After the Accessibility grant is detected and onboarding continues, confirm the Dock icon is hidden and a Kopper status item is visible with **Open Kopper**, **Capture Selection**, **Settings…**, and **Quit** menu items. | Not run | Not run — protected installed app and physical macOS observation required |
| ONBOARD-07 | Record whether any unexpected login-item prompt appeared: **Yes** or **No**. The expected result is **No**. | Not run | Not run — record Yes or No during physical clean-account onboarding |

| ID | Source and disposable fixture | App version / exact text / before-and-after source identity / clipboard / note evidence | Status | Evidence/blocker |
| --- | --- | --- | --- | --- |
| APP-01 | Google Chrome, local/offline editable page or text area | Not run | Not run | Not run — protected installed app and physical interaction required |
| APP-02 | ChatGPT macOS application, disposable draft composer | Not run | Not run | Not run — protected installed app and physical interaction required |
| APP-03 | Claude macOS application, disposable draft composer | Not run | Not run | Not run — protected installed app and physical interaction required |
| APP-04 | Cursor, unsaved plain-text editor tab | Not run | Not run | Not run — protected installed app and physical interaction required |
| APP-05 | TextEdit, unsaved plain-text document | Not run | Not run | Not run — protected installed app and physical interaction required |
| APP-06 | One additional native text app: Apple Notes, in a disposable local note | Not run | Not run | Not run — protected installed app and physical interaction required |

## Clipboard, focus, denial, and concurrency matrix

| ID | Case | Expected | Status | Evidence/blocker |
| --- | --- | --- | --- | --- |
| CLIP-01 | Prior clipboard is plain text; exact selected fixture becomes one note; prior clipboard is restored byte-for-byte. | Exact capture; byte-identical restoration; focus retained | Not run | Not run — physical clipboard test required |
| CLIP-02 | Prior clipboard is rich text; selected plain text becomes one note; prior rich formatting/text is restored. | Formatting/text representations restored; focus retained | Not run | Not run — physical clipboard test required |
| CLIP-03 | Prior clipboard contains image plus text; selected text becomes one note; image and text representations are restored. | Image, text, order, and supported representations restored | Not run | Not run — physical clipboard test required |
| CLIP-04 | Empty selection; no note is created; “Nothing selected” (or equivalent) appears; clipboard is unchanged. | No note; Nothing selected; clipboard/focus unchanged | Not run | Not run — physical clipboard test required |
| CLIP-05 | Selected text is exactly equal to prior clipboard text; exactly one note is created despite equal text; clipboard remains unchanged. | Exactly one note; clipboard/focus unchanged | Not run | Not run — physical clipboard test required |
| CLIP-06 | Whitespace-only selection; no note is created and clipboard is restored. | No note; clipboard/focus unchanged | Not run | Not run — physical clipboard test required |
| CLIP-07 | Secure input/protected password field is active; no note is created, protected content is never shown, failure is reported, clipboard is restored. | No note/content leak; failure; clipboard restored | Not run | Not run — physical secure-input test required |
| CLIP-08 | Revoke Kopper in System Settings > Privacy & Security > Accessibility while it runs, return to the source, invoke capture; no note is created, onboarding/denial is shown, clipboard is restored. Quit and relaunch while still revoked and confirm capture remains denied/onboarding remains available. Re-enable, relaunch if macOS requires it, and use Check again before later rows. | No capture; denial/onboarding persists; regrant/relaunch recovers; clipboard restored | Not run | Not run — physical revocation/relaunch test required |
| CLIP-09 | Select the fixture, invoke capture, and immediately close the disposable source window/application before copy completes; no partial/incorrect note is created, failure is bounded, clipboard is restored. | No partial/wrong note; clipboard restored | Not run | Not run — repeat physical race test 3 times |
| CLIP-10 | Invoke two rapid double-Shift gestures while one capture is in progress; transactions serialize, notes are not corrupted or unpredictably duplicated, and the original clipboard is restored after both settle. Record exact observed note count. | Serialized deterministic result; no corruption; clipboard restored | Not run | Not run — repeat physical concurrency test 3 times |
| CLIP-11 | Invoke capture while a Kopper editor selection is active; one note is created from the selection without recursive capture; clipboard is restored. | One capture; no recursive command; clipboard restored | Not run | Not run — physical self-capture test required |
| CLIP-12 | Use a source that cannot provide selectable text (for example an inert image); no note is created, failure is reported, clipboard is restored. | No note; bounded failure; clipboard restored | Not run | Not run — physical failure test required |
| CLIP-13 | Start with a clipboard that includes an app-specific custom pasteboard type. Record `clipboard info` before/after and the supported types restored. If the custom type is unsupported and lost, record the accepted limitation explicitly; do not mark restoration of that custom type Pass. | Record supported types restored; unsupported custom-type loss is an accepted limitation, never a Pass claim for that type | Not run | Not run — physical custom-type observation required |

## Note, section, completed, and context workflow matrix

| ID | Workflow | Status | Evidence/blocker |
| --- | --- | --- | --- |
| NOTE-01 | Add notes through the composer, including multiline Markdown; edit inline; save with `Cmd+Return`; cancel/discard without losing prior saved text. | Not run | Not run — physical app workflow required |
| NOTE-02 | Open expanded editing and **Edit in new window**; edit/save; close the editor window without quitting the main app. | Not run | Not run — physical app workflow required |
| NOTE-03 | Search active notes with pointer and `Cmd+K`; confirm active and completed results are correct and clearing search restores ordering. | Not run | Not run — physical app workflow required |
| NOTE-04 | Navigate cards by keyboard; confirm visible focus is distinct from selection. | Not run | Not run — physical app workflow required |
| NOTE-05 | Cmd-click toggles individual notes; Shift-click extends a range in displayed order. | Not run | Not run — physical app workflow required |
| NOTE-06 | `Cmd+C` and context-menu **Copy** preserve selected note content/order. | Not run | Not run — physical app workflow required |
| NOTE-07 | `Shift+Cmd+C` and **Copy as list** emit one Markdown list item per selected note in displayed order. | Not run | Not run — physical app workflow required |
| NOTE-08 | Merge selected notes with `Shift+Cmd+M` and context menu; body order/newlines are correct; Undo restores; repeat and retain the merge. | Not run | Not run — physical app workflow required |
| NOTE-09 | Delete selected notes with Delete and context menu; Undo restores during the session; acknowledged deletion persists after relaunch. | Not run | Not run — physical app workflow required |
| NOTE-10 | Complete selected notes with Space/button/context menu; completion timestamp/order behavior is visible; Completed search finds them. | Not run | Not run — physical app workflow required |
| NOTE-11 | Restore completed notes to their previous section/order; after deleting that section, restore another completed note to the first available section. | Not run | Not run — physical app workflow required |
| NOTE-12 | Move notes between sections with keyboard-accessible and pointer context menus; order and persistence are correct. | Not run | Not run — physical app workflow required |
| NOTE-13 | Context menus expose only applicable actions: Copy, Copy as list, Mark done/Restore, Expand, Edit, Edit in new window, Merge, Move, Delete. | Not run | Not run — physical app workflow required |
| NOTE-14 | Trigger a destructive action and a recoverable save failure if a safe fixture is available; UI does not imply success before persistence and offers Retry without losing edits. | Not run | Not run — safe physical failure fixture required |
| SECT-01 | Create and rename sections; reject an invalid/empty name without changing the prior value. | Not run | Not run — physical app workflow required |
| SECT-02 | Reorder sections and confirm explicit ordering survives relaunch. | Not run | Not run — physical app workflow required |
| SECT-03 | Move notes into another section through pointer and keyboard paths. | Not run | Not run — physical app workflow required |
| SECT-04 | Delete an empty section. | Not run | Not run — physical app workflow required |
| SECT-05 | Delete a non-empty section by choosing another destination; verify notes move correctly. | Not run | Not run — physical app workflow required |
| SECT-06 | Delete a non-empty section by explicitly deleting its notes; verify confirmation and session undo behavior where offered. | Not run | Not run — physical app workflow required |

## Shortcut, window, Dock/status, and persistence matrix

| ID | Workflow | Status | Evidence/blocker |
| --- | --- | --- | --- |
| WIN-01 | `Cmd+Shift+Space` shows and hides the panel; hiding does not quit. The panel opens near the active display's right edge. | Not run | Not run — physical window test required |
| WIN-02 | Resize to allowed minimum and larger sizes, move across displays/workspaces, quit/relaunch, and verify clamped saved bounds. | Not run | Not run — physical window/display test required |
| WIN-03 | Enable and disable pin/always-on-top; verify behavior against another window and persistence. | Not run | Not run — physical window test required |
| WIN-04 | Closing the panel hides it; the show/hide shortcut restores it. **Quit Kopper** exits instead of hiding. | Not run | Not run — physical window and quit test required |
| WIN-05 | Capture acknowledgement is non-activating; opening/hiding the panel restores focus predictably. | Not run | Not run — physical focus test required |
| WIN-06 | Main and expanded editor windows share the active theme; editor closure does not close the main window. | Not run | Not run — physical multiwindow test required |
| SHORT-01 | Verify defaults: Shift Shift capture, `Cmd+Shift+Space` show/hide, `Cmd+K` search, Return edit, `Cmd+Return` save, Space complete, `Cmd+C` copy, `Shift+Cmd+C` copy list, `Shift+Cmd+M` merge, Delete delete. | Not run | Not run — physical keyboard test required |
| SHORT-02 | Save valid custom capture and show/hide shortcuts; verify both work globally and persist after relaunch. | Not run | Not run — physical keyboard test required |
| SHORT-03 | Enter invalid and conflicting shortcuts; verify a specific explanation and preservation of the last valid configuration. | Not run | Not run — physical keyboard test required |
| SHORT-04 | Press Shift twice outside the interval and Shift-other-key-Shift; neither triggers capture. | Not run | Not run — physical keyboard test required |

## Data, import/export, recovery, and theme matrix

| ID | Workflow | Status | Evidence/blocker |
| --- | --- | --- | --- |
| DATA-01 | Confirm the active path is `~/Library/Application Support/Kopper/kopper.json` and normal use creates one transparent versioned JSON document, not silent backups. | Not run | Not run — physical filesystem observation required |
| DATA-02 | Export valid data, change active data, cancel an import, and verify active data is unchanged. | Not run | Not run — physical app workflow required |
| DATA-03 | Import the valid export, inspect preview/confirmation, replace data, and verify notes, sections, preferences, and ordering. | Not run | Not run — physical app workflow required |
| DATA-04 | Present malformed JSON; verify original bytes are not overwritten, export damaged bytes unchanged, and cancel **Create new store** without mutation. | Not run | Not run — isolated physical fixture required |
| DATA-05 | Explicitly confirm **Create new store**, then import a valid store; verify unsupported newer schema remains read-only/recoverable rather than overwritten. | Not run | Not run — isolated physical fixture required |
| DATA-06 | Leave an editor draft, quit/relaunch, and verify the single persisted draft; save or explicitly discard and verify it clears only then. | Not run | Not run — physical app workflow required |
| THEME-01 | Select System, Light, and Dark; verify System follows a live macOS appearance change and all app windows update. | Not run | Not run — physical appearance test required |
| THEME-02 | Activate every bundled preset (Oxide Ledger, Night Workshop, Index Drawer) in both usable appearance modes. | Not run | Not run — physical appearance test required |
| THEME-03 | Edit every exposed semantic color token and radius; verify live preview across representative controls/cards/dialogs and lifecycle states. | Not run | Not run — physical appearance test required |
| THEME-04 | Enter invalid syntax/unsupported color and a failing contrast pair; validation blocks save and leaves the active theme unchanged. | Not run | Not run — physical validation test required |
| THEME-05 | Save a valid custom theme; reset one token, then reset the complete theme; verify each scope. | Not run | Not run — physical appearance test required |
| THEME-06 | Export versioned shadcn-compatible JSON; import it, Preview, Cancel, and confirm exact visual rollback. | Not run | Not run — physical import/export test required |
| THEME-07 | Import again, Preview, Save, and confirm activation and persistence after relaunch. Verify missing lifecycle tokens derive deterministically when using a compatible fixture. | Not run | Not run — physical import/export test required |
| THEME-08 | Enable Reduce Motion in macOS; verify capture, insertion, and completion use immediate layout/opacity feedback without translation/collapse motion, and visible status does not rely on color alone. | Not run | Not run — physical accessibility test required |

## Security and privacy matrix

| ID | Observation | Status | Evidence/blocker |
| --- | --- | --- | --- |
| SEC-01 | Airplane/offline mode does not prevent local notes, search, themes, export, or other non-capture workflows; no account/login is requested. | Not run | Not run — physical offline test required |
| SEC-02 | No telemetry, analytics, crash-reporting, sync, update, or remote-content UI appears. No test note is sent to another service. | Not run | Not run — physical observation and audit association required |
| SEC-03 | Accessibility denial/revocation is explicit and recoverable; capture is unavailable while denied. | Not run | Not run — physical permission test required |
| SEC-04 | Secure-input test content never appears in a note, acknowledgement, log, exported data, or clipboard restoration evidence. | Not run | Not run — physical secure-input test required |
| SEC-05 | Imported malformed data/theme is validated and cannot silently replace active state. | Not run | Not run — physical invalid-import test required |
| SEC-06 | Gatekeeper launch succeeds without disabling security controls, removing quarantine, or using an override. | Not run | Not run — protected app required |

## Demo-parity and native panel matrix

| ID | Required demo-parity observation | Status | Evidence/blocker |
| --- | --- | --- | --- |
| DEMO-01 | Confirm the panel reads as a narrow floating macOS utility with rounded clipping, desktop shadow, translucent Oxide Ledger material, and the lifecycle rail in Light and Dark modes. | Not run | Not run — protected installed app visual review required |
| DEMO-02 | Confirm the resting command surface prioritizes Search and one overflow menu; lifecycle switching remains accessible while Add Section, Undo, pinning, and Settings stay out of the primary row. | Not run | Not run — protected installed app interaction review required |
| DEMO-03 | Confirm uppercase section labels, divider rules, counts, distinct elevated cards, and compact long-note previews allow several notes to be scanned without horizontal overflow. | Not run | Not run — protected installed app at default/minimum sizes required |
| DEMO-04 | Confirm a clamped long Markdown note retains complete content through Expand, Edit, Edit in New Window, keyboard access, and VoiceOver. | Not run | Not run — protected installed app and VoiceOver review required |
| DEMO-05 | Capture from another app and confirm the source remains frontmost, its selection remains undisturbed where supported, and Kopper does not steal keyboard focus. | Not run | Not run — physical cross-app focus test required |
| DEMO-06 | With Kopper visible and hidden, trigger success and safe failure/empty captures; confirm a detached nonactivating HUD appears for a bounded interval and a hidden main panel remains hidden. | Not run | Not run — physical HUD/nonactivation test required |
| DEMO-07 | Confirm a captured note appears only after persistence acknowledgement, at the end of the active section, and the exact inserted card is revealed/highlighted without a presentation-only duplicate on failure. | Not run | Not run — physical capture and safe failure fixture required |
| DEMO-08 | Repeat the same nonactivating capture experience across every required source application in APP-01 through APP-06. | Not run | Not run — physical source matrix required |
| DEMO-09 | Add two consecutive prompts with `Cmd+Return`; after each acknowledged add, confirm the composer clears, retains focus, is immediately reusable, and keeps the new note reachable without pointer refocus. | Not run | Not run — protected installed app prompt workflow required |
| DEMO-10 | Confirm resting, focused, multiline, and persisted-draft states remain one section-aware composer surface with both pointer Add and `Cmd+Return` paths at default and minimum panel sizes. | Not run | Not run — protected installed app at both panel sizes required |
| DEMO-11 | Confirm keyboard focus, single selection, additive/range selection, capture highlight, pending completion, and completed state remain visually distinct without relying on color alone. | Not run | Not run — physical keyboard and accessibility review required |
| DEMO-12 | Confirm note context menus expose only applicable actions and visibly label keyboard equivalents for Copy, Copy as list, Mark done/Restore, Edit, Edit in new window, Merge, and Delete. | Not run | Not run — protected installed app context-menu review required |
| DEMO-13 | Select notes in displayed order and confirm Copy as list emits Kopper's intentional unordered Markdown representation (`- item`) in that same order. | Not run | Not run — physical cross-app paste observation required |
| DEMO-14 | Paste copied notes into a second disposable application; confirm exact reusable content/order, accessible success feedback, and specific visible feedback for a safely induced clipboard failure if available. | Not run | Not run — physical paste and safe failure review required |
| DEMO-15 | Confirm the installed UI retains original Oxide Ledger colors, lifecycle rail, surfaces, and iconography and does not display Copper branding, logo, marketing copy, or an exact copied palette. | Not run | Not run — independent protected-artifact originality review required |

## Quit, process, and uninstall matrix

| ID | Workflow/command | Status | Evidence/blocker |
| --- | --- | --- | --- |
| PROC-01 | Panel close hides; Quit Kopper exits | Not run | Not run — installed app required |
| PROC-02 | Post-quit `pgrep` process check from the physical procedure | Not run | Not run — expected no Kopper/helper output |
| UNINST-01 | Remove exactly `/Applications/Kopper.app`, log out/in | Not run | Not run — physical uninstall required |
| UNINST-02 | Process check after uninstall | Not run | Not run — expected no Kopper/helper output |
| UNINST-03 | LaunchAgent/LaunchDaemon/privileged-helper `find` commands | Not run | Not run — expected no matching path |
| UNINST-04 | Login item AppleScript and System Settings check | Not run | Not run — expected no Kopper login item |
| UNINST-05 | `/Applications/Kopper.app` absent; local user data disposition recorded | Not run | Not run — physical uninstall required |

## Observed failures

| Failure ID | UTC | Artifact SHA-256 | Matrix row | Status | Bounded observation | Issue/reference | Release impact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| None recorded | Not run | Not run | Not run | Not run | Not run | Not run | Release remains incomplete until execution |

## Retest evidence

Append; do not replace the original failure.

| Retest ID | Failure ID | UTC | Version/tag/commit | Artifact SHA-256 | Machine/macOS | Status | Bounded result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| None | Not run | Not run | Not run | Not run | Not run | Not run | Not run |

## Residual risks

| Risk ID | Status | Risk | Scope/impact | Mitigation/owner | Release decision |
| --- | --- | --- | --- | --- | --- |
| RISK-01 | Not run | Required evidence has not been collected | Unknown release fitness | Execute all gates on immutable candidate | Blocked |
| RISK-02 | Accepted limitation; observation Not run | App-specific custom pasteboard formats outside Kopper's supported representations may not be restored | Custom clipboard metadata may be lost even when supported plain/rich/image representations are restored | Record declared types and physical observation; never mark an unsupported custom type Pass | Must be acknowledged separately from required supported-representation Pass rows |

## Final release decision

| Field | Value |
| --- | --- |
| Automated gate | Not run |
| Protected signed/notarized artifact gate | Not run |
| Physical capture/app workflow gate | Not run |
| Quit/uninstall gate | Not run |
| Open failures | Not run |
| Accepted residual risks | Not run |
| Final decision | **Incomplete — do not publish or promote** |
| Approver/date | Not run |
