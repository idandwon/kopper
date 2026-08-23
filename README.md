# Kopper

Kopper is a local-first macOS capture queue for collecting selected text and organizing short Markdown notes. It requires macOS 14 Sonoma or later.

## Install

Kopper requires macOS 14 Sonoma or newer. Install the latest signed and notarized release with:

```bash
curl -fsSL https://github.com/idandwon/kopper/releases/latest/download/install.sh | bash
```

Kopper is installed for your account at `~/Applications/Kopper.app` and opens automatically. Complete the in-app Accessibility onboarding if you want global selection capture.

To upgrade, quit Kopper and run the same command again. To uninstall the application, move `~/Applications/Kopper.app` to Trash. Your local notes remain at `~/Library/Application Support/Kopper/kopper.json` unless you deliberately remove that file.

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

The unsigned package is for local verification only. It is not a distributable release.

## Releases

Credentialed releases run in the protected GitHub `release` environment. Configure these environment secrets by name:

- `APPLE_API_KEY_P8`: contents of the App Store Connect API private key file
- `APPLE_API_KEY_ID`: App Store Connect API key identifier
- `APPLE_API_ISSUER`: App Store Connect API issuer identifier
- `CSC_LINK`: Developer ID Application signing certificate
- `CSC_KEY_PASSWORD`: signing certificate password

Do not put release credentials in repository files, command arguments, or logs.

The package version and pushed tag must match exactly: a package version of `<version>` requires tag `v<version>`. After updating and committing `package.json`, create and push the matching tag:

```bash
git tag "v$(node -p 'require("./package.json").version')"
git push origin "v$(node -p 'require("./package.json").version')"
```

On a clean, exactly tagged, credentialed macOS release runner, the release gate is:

```bash
pnpm package:release
```

The tag-triggered release workflow signs and notarizes the universal DMG, creates its SHA-256 checksum, and uploads the DMG, checksum, and exact tagged `install.sh` to a **draft GitHub Release**. That draft is an acceptance candidate, not a published release. The unsigned development package above is non-distributable.

Promotion is a separate manual action in the protected `release` environment. Run the **Promote Release** workflow with the exact candidate tag only after the versioned acceptance record is complete for the same tag, version, commit, DMG, and checksum. The promotion workflow verifies the draft and final evidence before changing the release to non-draft; any required `Fail` or `Not run` status blocks publication.
