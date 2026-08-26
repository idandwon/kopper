# Kopper

Kopper is a local-first macOS capture queue for collecting selected text and organizing short Markdown notes. It requires macOS 14 Sonoma or later.

## Install

Kopper is currently an **unsigned friends beta** for macOS 14 Sonoma or newer. Install the latest release with:

```bash
curl -fsSL https://github.com/idandwon/kopper/releases/latest/download/install.sh | bash
```

The installer verifies the immutable GitHub Release checksum and Kopper's bundle identity, then installs to `~/Applications/Kopper.app`. Apple has not signed or notarized this beta, so macOS may block the first launch. If it does, open **System Settings → Privacy & Security**, find Kopper, and choose **Open Anyway** once.

No `sudo`, `xattr`, Gatekeeper disablement, Node.js, or Homebrew is needed. The SHA-256 check protects the download against corruption or replacement within the immutable release; it does not make the app Apple-verified.

To upgrade, quit Kopper and run the same command again. Because each unsigned build has a new macOS code identity, an upgrade may require one fresh Accessibility approval: remove the existing Kopper entry with the minus button, add `~/Applications/Kopper.app` again, and enable it. To uninstall the application, move `~/Applications/Kopper.app` to Trash. Your local notes remain at `~/Library/Application Support/Kopper/kopper.json` unless you deliberately remove that file.

## Privacy and local data

Kopper stores its document locally at:

```text
~/Library/Application Support/Kopper/kopper.json
```

Kopper has no accounts, cloud synchronization, telemetry, analytics, crash reporting, or automatic updates. It does not send note content to a service.

## Accessibility

Kopper requests macOS Accessibility access to observe only the configured global shortcut gestures. It asks System Events to copy selected text only when you explicitly invoke capture, and restores supported clipboard content after the attempt.

During Accessibility onboarding Kopper remains visible in the Dock. After the grant is detected or you continue without capture, Kopper hides its Dock icon and provides a documented Kopper status item with **Open Kopper**, **Capture Selection**, **Settings…**, and **Quit**.

## Development

Use Node.js 24 and the Corepack-managed pnpm version pinned in `package.json`.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Run the verification commands independently:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
pnpm audit:deps
pnpm audit:source
```

Create and verify an unsigned local development package:

```bash
pnpm package:unsigned
pnpm verify:package "release/mac-universal/Kopper.app"
```

The ad-hoc signed package is for local verification only. It is not an Apple-trusted distributable release.

## Releases

Unsigned friends-beta releases require no repository or environment secrets. The package version and pushed tag must match exactly: version `<version>` requires tag `v<version>`.

After updating and committing `package.json`, create and push the matching tag:

```bash
git tag "v$(node -p 'require("./package.json").version')"
git push origin "v$(node -p 'require("./package.json").version')"
```

Before creating the first release tag, the repository owner must enable GitHub immutable releases and verify the repository setting reports enabled.

The tag-triggered **Release** workflow separates candidate execution from publication. An unprivileged `contents: read` build job runs the complete test, type, build, E2E, dependency-audit, and source-audit gates, explicitly disables signing and notarization, verifies the universal application package, and uploads an exact three-file workflow artifact. A fresh protected `release`-environment job gets `contents: write`, runs no dependency, package, or repository script, compares the artifact with the exact event Git objects and current remote tag, and creates the draft containing only the DMG, SHA-256 file, and tagged `install.sh`.

Inspect and physically test that draft with `tests/manual/macos-installer.md`. Record the accepted release commit as an exact 40-character lowercase SHA and the accepted DMG digest as an exact 64-character lowercase SHA-256. Only after that evidence is complete should an authorized reviewer approve and run **Promote Release** with all three required inputs: `tag`, `expected_commit`, and `expected_dmg_sha256`. Promotion runs no dependency, package, or repository script; it validates those accepted values before publication, rechecks the remote tag immediately before publishing, then re-downloads and revalidates the exact immutable asset set afterward. Publication is irreversible for that tag because immutable releases are enabled; a failed published candidate requires a new version and tag.
