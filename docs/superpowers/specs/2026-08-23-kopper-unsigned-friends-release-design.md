# Kopper Unsigned Friends Release Design

**Status:** Approved
**Date:** 2026-08-23  
**Repository:** `https://github.com/idandwon/kopper`

## 1. Goal

Let the repository owner publish an unsigned Kopper beta that friends can install with the existing command:

```bash
curl -fsSL https://github.com/idandwon/kopper/releases/latest/download/install.sh | bash
```

Publishing and installing this beta must require no Apple Developer Program membership, Developer ID certificate, App Store Connect API key, Team ID, notarization, Homebrew, Node.js, `sudo`, quarantine removal, or Gatekeeper disablement.

The result is explicitly a friends beta, not a warning-free production distribution. macOS may require the user to approve the installed app once through **System Settings → Privacy & Security → Open Anyway**.

## 2. Product Decision

Kopper will not attempt to make an unsigned app appear Apple-trusted. The installer will never run `xattr`, disable Gatekeeper, alter system security policy, or instruct users to paste a security-bypass command.

Instead, Kopper keeps repository-controlled integrity checks and makes the macOS trust boundary visible:

- GitHub Release immutability protects the published tag and assets from later replacement.
- The versioned SHA-256 file authenticates the downloaded DMG against the immutable release asset set.
- The installer accepts only the fixed `idandwon/kopper` origin and a strict semantic-version release.
- The mounted bundle must be a real, non-symlink root-level `Kopper.app` with identifier `com.kopper.app` and a version matching the release.
- macOS decides whether first launch requires manual approval.

An unsigned artifact is not equivalent to an Apple-notarized artifact. The README and installer output must state this plainly.

## 3. Release Contract

Every published beta contains exactly:

- `Kopper-<version>-universal.dmg`
- `Kopper-<version>-universal.dmg.sha256`
- `install.sh`

The package version and tag remain equal: version `0.1.0` requires tag `v0.1.0`.

The repository's immutable-release setting remains enabled. Release creation remains draft-first so all three assets can be inspected before publication. After publication, automation must require the exact release to report `isImmutable: true`.

No Apple credential or signing secret is read by the unsigned release path. Existing credentialed release code may be removed if it has no remaining caller; it must not remain as the documented or default path.

Draft acceptance records two immutable promotion inputs: the exact 40-character lowercase release commit SHA and the exact 64-character lowercase DMG SHA-256. Manual promotion requires both values in addition to the exact tag and rejects any later commit, tag movement, or asset replacement.

## 4. Packaging and Publication

The tag-triggered workflow uses two isolated macOS jobs:

1. An unprivileged build job with only `contents: read` checks out the exact event commit, installs locked dependencies, validates tag/package-version equality, runs the existing test, type, build, E2E, dependency-audit, and source-audit gates, builds with signing identity and notarization disabled, verifies package metadata including exact bundle version and architectures, creates the SHA-256 file, syntax-checks the tagged installer, and uploads one staged directory containing exactly the three release assets.
2. A fresh protected draft-publication job with `contents: write` and the `release` environment downloads that workflow artifact. It runs no dependency install, package script, or repository script. Trusted inline workflow logic checks the exact regular-file set and checksum, compares `install.sh` byte-for-byte with `git show "$GITHUB_SHA:install.sh"`, confirms the remote tag still resolves to `GITHUB_SHA`, and only then creates the draft.

The release environment requires no secrets for this path.

Promotion accepts required `tag`, `expected_commit`, and `expected_dmg_sha256` inputs. It runs no Corepack, dependency install, package script, or repository script. Trusted inline workflow logic validates the input formats, exact package/tag/commit equality, current remote tag, exact draft assets, installer bytes from the accepted Git object, checksum, and downloaded DMG digest before publication. It rechecks the remote tag immediately before publishing, then freshly re-downloads and revalidates the exact asset set, installer, accepted DMG digest, draft state, and `isImmutable: true`. Signed/notarized acceptance rows must not block an explicitly unsigned beta. The unsigned beta contract gets its own focused acceptance evidence instead of falsely marking Apple-signing checks as passed.

## 5. Installer Behavior

The installer retains:

- macOS 14+ and non-root preflight;
- fixed GitHub origin and semantic-version resolution;
- HTTPS-only downloads with retries;
- strict single-line checksum-file parsing and SHA-256 verification;
- read-only, non-browsing DMG mount;
- exactly one real root-level `Kopper.app`;
- exact bundle identifier and release version checks;
- running-process refusal;
- same-filesystem staging, rollback, signal reconciliation, and bounded cleanup;
- preservation of all data outside `~/Applications/Kopper.app`.

The installer removes:

- `codesign` and `spctl` command prerequisites;
- DMG Gatekeeper assessment;
- mounted, staged, and installed app signature/Gatekeeper assessment.

`verify_app` becomes a product-identity check rather than an Apple-trust check. It validates the real directory, `Info.plist`, exact bundle identifier, and exact version at mounted, staged, and installed locations.

## 6. First Launch and Transaction Commit

Installation success must not depend on `open` returning success for an unsigned app. Once checksum verification, installed product-identity validation, and installer cleanup succeed, the transaction is committed.

The installer then attempts to open Kopper:

- Attempt `open` as a best-effort convenience after commit.
- Always print the installed location and the one-time manual approval steps because `open` can return without proving that the app passed the visible Gatekeeper prompt.
- If `open` fails, keep the installed application and still return success.

The installer must not restore the previous app merely because first launch was blocked. A launch warning is a user-approval state, not an installation failure.

## 7. User Documentation

The README install section will say:

- this is an unsigned friends beta;
- the command installs into `~/Applications/Kopper.app`;
- macOS may require one manual **Open Anyway** approval;
- no `sudo`, `xattr`, Gatekeeper disablement, Node.js, or Homebrew is needed;
- the checksum protects the download, but Apple has not notarized the app.

Release documentation will remove Apple-secret setup from the active beta path and replace signed/notarized claims with accurate unsigned-beta language. Historical evidence remains historical and must not be rewritten to claim checks that were never run.

## 8. Testing

Hermetic installer tests must prove:

- unsigned DMG/app installation no longer calls or requires `codesign` or `spctl`;
- checksum, bundle identifier, version, real-directory, exact-root-app, and transactional failures still reject safely;
- a blocked `open` keeps the newly installed app, removes rollback/staging/download artifacts, preserves local data, prints manual approval instructions, and exits successfully;
- an ordinary successful launch still exits successfully;
- upgrades retain the existing rollback guarantees through the new pre-launch commit point.

Workflow tests must prove:

- no Apple secret is referenced;
- the release build explicitly disables signing and notarization;
- the exact tagged installer and versioned DMG/checksum are the only release assets;
- draft inspection and immutable publication remain enforced;
- unsigned beta acceptance replaces, rather than falsifies, signed-release evidence.

Verification includes focused TDD, the full unit suite, typecheck, build, Electron E2E, installer syntax, release-document traceability, dependency/source audits, `actionlint`, and an actual GitHub tag workflow before the curl command is shared.

## 9. Rollout

1. Implement and merge the unsigned installer/release changes.
2. Push clean `main` and require CI success.
3. Confirm immutable releases remain enabled and the release environment has no required secrets.
4. Create and push `v0.1.0` at the exact package-version commit.
5. Inspect the draft's exact three assets and run the unsigned beta acceptance checks on a clean macOS 14+ account.
6. Promote the draft and verify the release is immutable.
7. Run the canonical curl command on a second clean account before sending it to friends.

The curl command is not called live until the public release, immutable state, and physical installer check are all confirmed.

## 10. Out of Scope

- Apple Developer enrollment, Developer ID, Team ID, notarization, or App Store distribution.
- Automatic Gatekeeper bypass or quarantine removal.
- Silent first-launch approval.
- Automatic updates, package managers, mirrors, forks, telemetry, or analytics.
- Claiming the unsigned beta is Apple-verified or suitable for broad production distribution.
