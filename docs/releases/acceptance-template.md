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

| ID | Source | App version | Exact text | Before/after source identity | Clipboard restored | One note only | Status | Evidence/blocker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ONBOARD-01 | First-run explanation, grant, System Settings, Check again | Not run | Not run | Not run | Not run | Not run | Not run | Not run — physical clean-account onboarding required |
| APP-01 | Google Chrome | Not run | Not run | Not run | Not run | Not run | Not run | Not run — protected installed app and physical interaction required |
| APP-02 | ChatGPT macOS application | Not run | Not run | Not run | Not run | Not run | Not run | Not run — protected installed app and physical interaction required |
| APP-03 | Claude macOS application | Not run | Not run | Not run | Not run | Not run | Not run | Not run — protected installed app and physical interaction required |
| APP-04 | Cursor | Not run | Not run | Not run | Not run | Not run | Not run | Not run — protected installed app and physical interaction required |
| APP-05 | TextEdit | Not run | Not run | Not run | Not run | Not run | Not run | Not run — protected installed app and physical interaction required |
| APP-06 | Apple Notes (additional native app) | Not run | Not run | Not run | Not run | Not run | Not run | Not run — protected installed app and physical interaction required |

## Clipboard, focus, denial, and concurrency matrix

| ID | Case | Expected | Status | Evidence/blocker |
| --- | --- | --- | --- | --- |
| CLIP-01 | Plain-text prior clipboard | Exact capture; byte-identical restoration; focus retained | Not run | Not run — physical clipboard test required |
| CLIP-02 | Rich-text prior clipboard | Formatting/text representations restored; focus retained | Not run | Not run — physical clipboard test required |
| CLIP-03 | Image-plus-text prior clipboard | Image, text, order, and supported representations restored | Not run | Not run — physical clipboard test required |
| CLIP-04 | Empty selection | No note; Nothing selected; clipboard/focus unchanged | Not run | Not run — physical clipboard test required |
| CLIP-05 | Selection equals prior clipboard text | Exactly one note; clipboard/focus unchanged | Not run | Not run — physical clipboard test required |
| CLIP-06 | Whitespace-only selection | No note; clipboard/focus unchanged | Not run | Not run — physical clipboard test required |
| CLIP-07 | Secure input with inert test password | No note/content leak; failure; clipboard restored | Not run | Not run — physical secure-input test required |
| CLIP-08 | Accessibility permission revoked at runtime and after relaunch | No capture; denial/onboarding persists; regrant/relaunch recovers; clipboard restored | Not run | Not run — physical revocation/relaunch test required |
| CLIP-09 | Source closes during capture | No partial/wrong note; clipboard restored | Not run | Not run — repeat physical race test 3 times |
| CLIP-10 | Rapid repeated double-Shift | Serialized deterministic result; no corruption; clipboard restored | Not run | Not run — repeat physical concurrency test 3 times |
| CLIP-11 | Kopper editor is source | One capture; no recursive command; clipboard restored | Not run | Not run — physical self-capture test required |
| CLIP-12 | Unsupported/nontext source | No note; bounded failure; clipboard restored | Not run | Not run — physical failure test required |
| CLIP-13 | App-specific custom pasteboard type | Record supported types restored; unsupported custom-type loss is an accepted limitation, never a Pass claim for that type | Not run | Not run — physical custom-type observation required |

## Note, section, completed, and context workflow matrix

| ID | Workflow | Status | Evidence/blocker |
| --- | --- | --- | --- |
| NOTE-01 | Composer add; multiline Markdown; inline edit; `Cmd+Return`; cancel/discard | Not run | Not run — physical app workflow required |
| NOTE-02 | Expand and Edit in new window; save and close editor independently | Not run | Not run — physical app workflow required |
| NOTE-03 | Search active/completed with pointer and `Cmd+K` | Not run | Not run — physical app workflow required |
| NOTE-04 | Keyboard focus, visible focus, Cmd-click toggle, Shift-click range | Not run | Not run — physical app workflow required |
| NOTE-05 | Copy and `Cmd+C` preserve content/order | Not run | Not run — physical app workflow required |
| NOTE-06 | Copy as list and `Shift+Cmd+C` preserve displayed order | Not run | Not run — physical app workflow required |
| NOTE-07 | Merge and `Shift+Cmd+M`; newline order; Undo and repeat | Not run | Not run — physical app workflow required |
| NOTE-08 | Delete and Delete key; Undo; retained deletion persists | Not run | Not run — physical app workflow required |
| NOTE-09 | Complete with Space/button/menu; searchable Completed view | Not run | Not run — physical app workflow required |
| NOTE-10 | Restore previous placement and fallback when section is gone | Not run | Not run — physical app workflow required |
| NOTE-11 | Move notes through pointer and keyboard context-menu paths | Not run | Not run — physical app workflow required |
| NOTE-12 | Context menu shows only applicable actions | Not run | Not run — physical app workflow required |
| NOTE-13 | Failed save preserves edit, reports failure, and supports Retry | Not run | Not run — safe physical failure fixture required |
| SECT-01 | Create, rename, invalid-name rejection | Not run | Not run — physical app workflow required |
| SECT-02 | Reorder and persist sections | Not run | Not run — physical app workflow required |
| SECT-03 | Delete empty section | Not run | Not run — physical app workflow required |
| SECT-04 | Delete non-empty section by moving notes | Not run | Not run — physical app workflow required |
| SECT-05 | Delete non-empty section and notes with explicit confirmation | Not run | Not run — physical app workflow required |

## Shortcut, window, Dock/status, and persistence matrix

| ID | Workflow | Status | Evidence/blocker |
| --- | --- | --- | --- |
| SHORT-01 | Every default shortcut from the spec | Not run | Not run — physical keyboard test required |
| SHORT-02 | Valid custom capture/show shortcuts work globally and persist | Not run | Not run — physical keyboard test required |
| SHORT-03 | Invalid/conflicting shortcut explains and retains last valid value | Not run | Not run — physical keyboard test required |
| SHORT-04 | Slow/intervening-key Shift sequences do not capture | Not run | Not run — physical keyboard test required |
| WIN-01 | `Cmd+Shift+Space` show/hide; close hides without quit | Not run | Not run — physical window test required |
| WIN-02 | Right-edge placement, min resize, move/display clamp, persisted bounds | Not run | Not run — physical window/display test required |
| WIN-03 | Pin/always-on-top toggles and persists | Not run | Not run — physical window test required |
| WIN-04 | Capture acknowledgement does not activate; source focus restores | Not run | Not run — physical focus test required |
| WIN-05 | Main/editor windows coexist and share theme | Not run | Not run — physical multiwindow test required |
| WIN-06 | Dock icon/name/status behavior; no unexpected menu-bar item | Not run | Not run — physical macOS observation required |
| WIN-07 | Relaunch preserves acknowledged content/preferences only | Not run | Not run — physical persistence test required |

## Data, import/export, recovery, and theme matrix

| ID | Workflow | Status | Evidence/blocker |
| --- | --- | --- | --- |
| DATA-01 | One versioned JSON at `~/Library/Application Support/Kopper/kopper.json`; no silent backups | Not run | Not run — physical filesystem observation required |
| DATA-02 | Export valid data; cancel import without mutation | Not run | Not run — physical app workflow required |
| DATA-03 | Preview/confirm valid import; content/order/preferences replaced correctly | Not run | Not run — physical app workflow required |
| DATA-04 | Malformed store remains byte-identical; damaged-byte export; cancel new store | Not run | Not run — isolated physical fixture required |
| DATA-05 | Confirm new store; import recovery; newer schema is read-only/recoverable | Not run | Not run — isolated physical fixture required |
| DATA-06 | One draft persists; clears only on successful save/discard | Not run | Not run — physical app workflow required |
| THEME-01 | System/Light/Dark and live system change across all windows | Not run | Not run — physical appearance test required |
| THEME-02 | Every bundled preset in usable modes | Not run | Not run — physical appearance test required |
| THEME-03 | Edit all exposed semantic colors/radius with live preview | Not run | Not run — physical appearance test required |
| THEME-04 | Invalid syntax/format/contrast blocks save | Not run | Not run — physical validation test required |
| THEME-05 | Save custom theme; reset one token; reset complete theme | Not run | Not run — physical appearance test required |
| THEME-06 | Export; import; Preview; Cancel restores exact prior appearance | Not run | Not run — physical import/export test required |
| THEME-07 | Import; Preview; Save; derived lifecycle tokens; relaunch persistence | Not run | Not run — physical import/export test required |
| THEME-08 | Reduce Motion and non-color state cues | Not run | Not run — physical accessibility test required |

## Security and privacy matrix

| ID | Observation | Status | Evidence/blocker |
| --- | --- | --- | --- |
| SEC-01 | Gatekeeper launch without bypass or security-control change | Not run | Not run — protected app required |
| SEC-02 | Accessibility is explicit, denied when revoked, and recoverable | Not run | Not run — physical permission test required |
| SEC-03 | Secure-input fixture never appears in note/UI/log/export/clipboard evidence | Not run | Not run — physical secure-input test required |
| SEC-04 | Offline local workflows work; no account/login required | Not run | Not run — physical offline test required |
| SEC-05 | No telemetry, sync, crash reporting, updater, or remote-content UI observed | Not run | Not run — physical observation and audit association required |
| SEC-06 | Malformed imports cannot silently replace active state | Not run | Not run — physical invalid-import test required |

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
