# Kopper

Kopper is a local-first macOS capture queue for collecting selected text and organizing short Markdown notes. It requires macOS 14 Sonoma or later.

## Privacy and local data

Kopper stores its document locally at:

```text
~/Library/Application Support/Kopper/kopper.json
```

Kopper has no accounts, cloud synchronization, telemetry, analytics, crash reporting, or automatic updates. It does not send note content to a service.

Kopper requests macOS Accessibility access so that, only when capture is invoked, it can ask System Events to copy the text selected in the active application. This enables capture from other applications while Kopper restores the supported clipboard content after the attempt.

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

The release workflow signs and notarizes the universal DMG, creates its SHA-256 checksum, and publishes only the DMG and checksum to the GitHub Release.
