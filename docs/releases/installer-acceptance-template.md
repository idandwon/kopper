# Kopper v<version> post-publication installer acceptance

> **Acceptance status: Incomplete — Not run**
>
> This record is post-publication evidence for the public `releases/latest` installer. It supplements and never replaces the pre-promotion DMG gate in `docs/releases/acceptance-template.md` and `tests/manual/macos-capture.md`.

Procedure: [`tests/manual/macos-installer.md`](../../tests/manual/macos-installer.md)

## Release and physical-Mac metadata

| Field | Value |
| --- | --- |
| Published release URL | Not run — `<release URL>` |
| Exact release tag | Not run — `v<version>` |
| Exact package version | Not run — `<version>` |
| Full release commit SHA | Not run — `<40-character SHA>` |
| Public installer URL | Not run — `https://github.com/idandwon/kopper/releases/latest/download/install.sh` |
| Physical Mac model | Not run — bounded `/usr/sbin/sysctl -n hw.model` output |
| Machine architecture | Not run — bounded `uname -m` output |
| macOS version/build | Not run — bounded `sw_vers` output; must be macOS 14+ |
| Tester | Not run |
| UTC start bound | Not run — `<YYYY-MM-DDTHH:MM:SSZ>` |
| UTC end bound | Not run — `<YYYY-MM-DDTHH:MM:SSZ>` |

## Evidence rules

- Each required row has exactly one status: `Pass`, `Fail`, or `Not run`.
- Record the exact command, UTC time, exit status, and at most 20 relevant output lines; redact account names and home-directory prefixes.
- `Not run` must name its blocker and next action. A `Fail` includes intermittent observations.
- Preserve failed evidence. Append every retest below; never replace an earlier observation or change a failure into a pass without retaining both records.
- This document is an after-publication acceptance record only. It is not a promotion input and does not alter the 91-row pre-promotion traceability contract.

## Installer acceptance evidence

| ID | Required observation | Status | Evidence/blocker |
| --- | --- | --- | --- |
| INST-01 | The canonical curl command exits 0 on macOS 14+ without Git, Node.js, pnpm, Homebrew, sudo, a Gatekeeper bypass, or quarantine removal. | Not run | Not run — run the published installer on a clean macOS 14+ standard account. |
| INST-02 | The installed target is exactly `~/Applications/Kopper.app`; bundle version, identifier `com.kopper.app`, and minimum system version `14.0` match the promoted release. | Not run | Not run — record bounded PlistBuddy output from the installed app. |
| INST-03 | `codesign --verify --deep --strict` and `spctl --assess --type execute` accept the installed application. | Not run | Not run — record bounded command output and exit statuses. |
| INST-04 | After installation, no Kopper DMG remains mounted and no `.Kopper.app.install.*` or `.Kopper.app.rollback.*` path remains. | Not run | Not run — record bounded `hdiutil info` and `find` output. |
| INST-05 | Running Kopper makes a repeated install fail without changing the installed bundle; after quitting, rerunning succeeds and preserves the SHA-256 of an inert `kopper.json` fixture. | Not run | Not run — retain before/after store hashes and both installer observations. |
| INST-06 | The installed app launches normally and completes existing Accessibility onboarding without an override. | Not run | Not run — record physical onboarding observation. |

## Retest evidence

Append; do not replace the original failure.

| Retest ID | Failure ID | UTC | Tag/version/commit | Mac/macOS | Status | Bounded result |
| --- | --- | --- | --- | --- | --- | --- |
| None | Not run | Not run | Not run | Not run | Not run | Not run |
