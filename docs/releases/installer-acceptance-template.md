# Kopper v<version> unsigned friends-beta installer acceptance

> **Acceptance status: Incomplete — Not run**
>
> This template records unsigned friends-beta acceptance. It is not evidence until copied to a versioned record and filled with bounded observations.

Procedure: [`tests/manual/macos-installer.md`](../../tests/manual/macos-installer.md)

`UNSIGNED-01` through `UNSIGNED-03` are pre-promotion evidence against the exact draft. `UNSIGNED-04` through `UNSIGNED-06` are required post-publication installer checks on a second clean account. This template never changes the 91-row signed-release traceability record.

## Release and physical-Mac metadata

| Field | Value |
| --- | --- |
| Draft release URL/run ID | Not run — `<draft URL and workflow run URL>` |
| Promotion workflow run ID | Not run — `<promotion workflow run URL>` |
| Published release URL | Not run — `<release URL>` |
| Published release immutable | Not run — exact tag must report `isImmutable: true` after promotion |
| Exact release tag | Not run — `v<version>` |
| Exact package version | Not run — `<version>` |
| Accepted `expected_commit` input | Not run — exact `<40-character lowercase release commit SHA>` recorded before promotion |
| Exact five asset names | Not run |
| Accepted `expected_arm64_dmg_sha256` input | Not run — exact `<64-character lowercase arm64 DMG SHA-256>` recorded before promotion |
| Accepted `expected_x64_dmg_sha256` input | Not run — exact `<64-character lowercase x64 DMG SHA-256>` recorded before promotion |
| Public installer URL | Not run — `https://github.com/idandwon/kopper/releases/latest/download/install.sh` |
| First-launch result | Not run — `direct` or `Open Anyway` |
| Security bypass used | Not run — must be `No` |
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
- The pre-promotion draft test never runs the draft `install.sh`; its fixed `releases/latest` origin cannot address a draft. The post-publication checks use the canonical curl installer only after the exact release is immutable.
- Promotion requires the exact `tag`, `expected_commit`, `expected_arm64_dmg_sha256`, and `expected_x64_dmg_sha256` values recorded in this acceptance record. Do not approve or dispatch promotion with values copied from a later checkout or re-download.
- Record that the protected promotion job ran no dependency install, package script, or repository script; it must recheck the remote tag immediately before publication and re-download the exact assets afterward.
- Do not use `sudo`, `xattr`, Gatekeeper disablement, quarantine removal, or another shell security bypass. If macOS blocks the unsigned beta, record the one-time **System Settings → Privacy & Security → Open Anyway** result.

## Unsigned friends-beta acceptance evidence

| ID | Required observation | Status | Evidence/blocker |
| --- | --- | --- | --- |
| UNSIGNED-01 | The exact draft contains only the versioned arm64 and x64 DMGs, their matching SHA-256 files, and the tagged `install.sh`; both checksum verifications succeed. | Not run | Not run — create the draft and inspect its exact five assets. |
| UNSIGNED-02 | Each root-level real `Kopper.app` reports the exact version, bundle identifier `com.kopper.app`, minimum macOS `14.0`, and only its declared runtime architecture. | Not run | Not run — mount both draft DMGs read-only and record bounded metadata and normalized `lipo` output for each. |
| UNSIGNED-03 | A manual draft installation to `~/Applications/Kopper.app` preserves the inert `kopper.json` hash and first launch either opens directly or succeeds after one System Settings → Privacy & Security → Open Anyway approval; no shell security bypass is used. | Not run | Not run — run the manual draft procedure on a clean account and record the first-launch result. |
| UNSIGNED-04 | After publication, the canonical installer leaves exactly `~/Applications/Kopper.app`, no mounted Kopper DMG, and no `.Kopper.app.install.*` or `.Kopper.app.rollback.*` artifact. | Not run | Not run — promote only after approved draft evidence, then inspect the clean second account. |
| UNSIGNED-05 | After publication, running-process refusal and a subsequent quit-and-upgrade preserve the app transaction and the inert `kopper.json` SHA-256. | Not run | Not run — retain before/after store hashes and both installer observations. |
| UNSIGNED-06 | After immutable publication, the canonical curl command exits 0 on a second clean macOS 14+ standard account and prints the unsigned-beta approval guidance. | Not run | Not run — record the immutable result and canonical installer output. |

## Retest evidence

Append; do not replace the original failure.

| Retest ID | Failure ID | UTC | Tag/version/commit | Mac/macOS | Status | Bounded result |
| --- | --- | --- | --- | --- | --- | --- |
| None | Not run | Not run | Not run | Not run | Not run | Not run |
