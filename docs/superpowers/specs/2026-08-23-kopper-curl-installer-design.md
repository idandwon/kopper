# Kopper Public macOS Installer Design

**Date:** 2026-08-23
**Status:** Approved in design review; awaiting written-spec review

## 1. Purpose

Kopper will be published as a public repository at `github.com/idandwon/kopper`. A Mac user must be able to install the latest published Kopper release with one command:

```bash
curl -fsSL https://github.com/idandwon/kopper/releases/latest/download/install.sh | bash
```

The installer is a convenience layer over Kopper's existing protected release process. It installs only a published, Developer ID-signed and notarized universal DMG. It never builds source on the user's Mac or weakens macOS security controls.

## 2. Chosen Approach

Publish `install.sh` beside the existing versioned DMG and checksum in every GitHub Release. The script uses only tools included with macOS, downloads the exact assets for the latest published semantic-version tag, verifies them, and installs Kopper without administrator privileges.

This approach is preferred over:

- building from source, which would require Git, Node.js, Corepack, and pnpm and would produce an unsigned local build;
- a Homebrew cask, which would require users to install Homebrew and would add a tap and release-maintenance surface; and
- an unsigned downloadable application, which would produce a poor and unsafe Gatekeeper experience.

## 3. Goals

1. Provide one copyable installation command for macOS users.
2. Require no Git, Node.js, pnpm, Homebrew, `sudo`, or package-manager setup on the destination Mac.
3. Install only a checksum-valid, Developer ID-signed, notarized Kopper release.
4. Support rerunning the same command to upgrade an existing installation.
5. Preserve the existing document, preferences, themes, and Accessibility onboarding behavior.
6. Fail without damaging a working installation.
7. Keep the script small enough to audit directly.

## 4. Non-goals

- Automatic or background updates.
- A Homebrew tap or submission to the official Homebrew cask repository.
- Mac App Store distribution.
- Installing on Windows, Linux, or macOS versions older than 14 Sonoma.
- Installing developer tools or building Kopper from source.
- Bypassing Gatekeeper, clearing quarantine attributes, or advising users to use **Open Anyway**.
- Collecting installer analytics, telemetry, or machine information.
- Deleting user data during installation, upgrade, or uninstall instructions.

## 5. Published Release Contract

Every promoted release contains exactly these installer-facing assets for version `<version>`:

- `Kopper-<version>-universal.dmg`
- `Kopper-<version>-universal.dmg.sha256`
- `install.sh`

`install.sh` is uploaded from the exact tagged revision being released. It is not fetched from mutable `main` during installation.

The existing draft-and-promote boundary remains authoritative:

1. `.github/workflows/release.yml` builds, signs, notarizes, verifies, and uploads the DMG, checksum, and tagged installer as a draft GitHub Release.
2. `.github/workflows/promote-release.yml` requires and verifies the exact three assets before publishing the draft.
3. GitHub's `/releases/latest` route exposes the installer only after promotion; draft and prerelease candidates are not installable through the canonical command.

The existing protected Apple credentials, exact tag/version checks, acceptance evidence, and artifact verification remain unchanged except where asset-set validation must include `install.sh`.

## 6. Installer Interface

The root-level `install.sh` runs under the Bash version shipped with supported macOS releases. It accepts no required arguments and installs the latest published release for `idandwon/kopper`.

The destination is:

```text
~/Applications/Kopper.app
```

Using the per-user Applications directory avoids `sudo`, administrator prompts, and system-wide mutation. The script creates `~/Applications` when necessary.

Rerunning the same command performs an upgrade. No separate update service, launch agent, or in-application updater is introduced.

## 7. Installation Flow

The script performs these steps in order:

1. Enable strict shell behavior and register cleanup for all temporary resources.
2. Confirm the host is macOS 14 or newer and that the script is not running as root.
3. Confirm required built-in commands are available: `curl`, `hdiutil`, `shasum`, `codesign`, `spctl`, `ditto`, `open`, `pgrep`, `mktemp`, and `sw_vers`.
4. Resolve `https://github.com/idandwon/kopper/releases/latest`, capture its final redirect, and validate that its basename is an exact `v<major>.<minor>.<patch>` tag.
5. Derive the versioned DMG and checksum filenames from that validated tag.
6. Download both assets from the exact tag-specific GitHub Release URL into a newly created temporary directory.
7. Verify the downloaded DMG against its published SHA-256 checksum.
8. Ask Gatekeeper to assess the DMG as a primary-signature distribution artifact.
9. Mount the DMG read-only and without opening Finder, using a dedicated temporary mount point.
10. Require exactly one expected `Kopper.app` at the DMG root, verify its deep code signature, and ask Gatekeeper to assess it as executable code.
11. Refuse to continue if Kopper is currently running and tell the user to quit it and rerun the command.
12. Copy the verified application to a staging path inside `~/Applications`.
13. Verify the staged application before replacing any existing installation.
14. Move an existing `Kopper.app` to a private rollback path, move the staged application into place, and restore the previous application if final installation fails.
15. Remove the rollback copy only after the installed application passes final signature verification.
16. Unmount the DMG, remove temporary resources, and launch the installed application.

The installer never evaluates downloaded text, executes a binary from the mounted DMG, or follows an unvalidated release tag or asset name.

## 8. User Data and Permissions

Installation touches only the application bundle under `~/Applications`. It does not read, modify, migrate, or delete:

```text
~/Library/Application Support/Kopper/kopper.json
```

Replacing the application therefore preserves notes, sections, themes, settings, and drafts.

The script does not automate Accessibility permission changes. After first launch, Kopper's existing onboarding explains and requests the permission through the normal macOS System Settings flow.

Manual uninstall documentation tells users to move `~/Applications/Kopper.app` to Trash. It states separately that local Kopper data remains until the user deliberately removes it.

## 9. Output and Failure Behavior

Normal output stays concise and identifies the release being installed:

```text
Finding latest Kopper release...
Downloading Kopper v0.1.0...
Verifying checksum and Apple signature...
Installing to ~/Applications...
Kopper installed successfully.
```

Every failure exits nonzero with one actionable message. Required cases are:

- unsupported platform or macOS version;
- accidental root execution;
- missing required system command;
- no published release or GitHub/network failure;
- malformed or unsupported latest tag;
- missing release asset;
- checksum mismatch;
- DMG or application Gatekeeper rejection;
- invalid application signature or unexpected DMG contents;
- Kopper already running;
- failure to mount, stage, replace, verify, restore, unmount, or launch.

Cleanup always attempts to detach a mounted DMG and remove temporary files. A failed upgrade retains or restores the previously installed application. Error reporting must not dump environment variables, HTTP credentials, or unrelated filesystem contents.

## 10. Testing and Verification

### 10.1 Installer tests

Automated tests execute the script against temporary directories and controlled command shims. They cover at least:

- successful first installation;
- successful replacement of an existing installation;
- rollback after replacement failure;
- unsupported platform and macOS version;
- root execution refusal;
- malformed release tag;
- download or missing-asset failure;
- checksum mismatch;
- signature or Gatekeeper rejection;
- unexpected DMG contents;
- running Kopper refusal;
- cleanup after success and failure; and
- preservation of files outside the application destination.

`bash -n install.sh` provides a separate syntax gate. Tests must not access the network, mount a real disk image, write to the real Applications directories, or invoke real signing tools.

### 10.2 Release workflow tests

Existing workflow tests verify that:

- the release workflow uploads `install.sh` from the tagged checkout;
- the draft contains exactly the required DMG, checksum, and installer assets;
- promotion rejects a missing or unexpected installer asset; and
- the installer is not exposed through the canonical latest-release URL before promotion.

### 10.3 Physical acceptance

For the first published installer release, run the canonical curl command on a clean supported Mac account and record:

- no developer tools or package manager are required;
- the correct version is installed at `~/Applications/Kopper.app`;
- Gatekeeper accepts the DMG and application without a bypass;
- Kopper launches and completes existing Accessibility onboarding;
- rerunning the command upgrades or reinstalls successfully; and
- existing local notes remain unchanged.

The existing protected physical release-acceptance matrix remains required. Installer acceptance supplements it rather than replacing it.

## 11. Documentation

The README leads with the canonical one-line installer command for ordinary users. Development and unsigned local packaging instructions remain clearly separated.

The installation section documents:

- macOS 14 or newer;
- installation into `~/Applications`;
- first-launch Accessibility onboarding;
- rerunning the same command to upgrade;
- quitting Kopper before upgrading; and
- manual application removal without implying that local data is also deleted.

It must not document Gatekeeper bypasses, quarantine removal, or unsigned public installation.

## 12. Repository and Ownership

The canonical public repository and release origin is `https://github.com/idandwon/kopper`. The installer refuses alternate or caller-provided artifact origins in this version. Supporting forks, mirrors, enterprise update channels, or configurable repositories requires a separate design.
