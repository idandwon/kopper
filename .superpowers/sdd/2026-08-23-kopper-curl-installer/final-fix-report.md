# Kopper curl-installer final fix report

## Status

Implemented the one permitted final-review fix wave from base `f3995d28a232115425f51ad0e535028b261c5fb7`. No GitHub repository, remote, tag, release, immutable-release setting, environment, or secret was mutated.

## Commits

- Source/docs/tests/ledger commit: `4698de1ac5111a135e5c2c3e91a4927a291ae023` (`fix: harden public macOS installer release`).
- Final report: committed separately so it can name the source commit exactly.

## RED/GREEN evidence

- Product identity: RED showed file, symlink, wrong `CFBundleIdentifier`, and wrong release version fixtures could be installed; GREEN requires a non-symlink directory, `com.kopper.app`, the resolved release version, `codesign`, and Gatekeeper. Publisher provenance intentionally has no Team ID seam: it is the immutable exact-tag release plus checksum and Apple platform verification.
- Transaction: RED showed inconsistency after the staged-to-target rename, old-app restoration after post-launch backup-cleanup failure, and loss of a valid app after interrupted partial backup deletion. GREEN uses explicit phases, deferred signals, post-rename filesystem reconciliation, and a post-launch committed boundary that retains the new app.
- Successful upgrade: a cleanup mutation produced RED with one rollback artifact; GREEN verifies the new marker, launch, zero artifacts, sibling preservation, and inert-store preservation.
- Release immutability: RED showed no post-publication check; GREEN requires exact tag, non-draft state, and `isImmutable: true` after publication. Final self-review regressions then went RED because the tag workflow had no independent pre-draft setting check and because that check lacked the current REST API version header; GREEN adds a versioned read-only repository `GET` guard before draft creation. The user-owned pre-first-tag handoff uses versioned repository immutable-release `PUT`, then an independent `GET` requiring `enabled: true`.
- Physical procedure: complete `hdiutil info -plist` state is converted and evaluated before bounded evidence is emitted; any exact versioned Kopper DMG match exits nonzero.

## Verification

- `pnpm verify:installer`: pass.
- `pnpm exec vitest run scripts/install.test.ts scripts/workflows.test.ts --reporter=verbose`: pass, 2 files and 45 tests.
- `pnpm validate:release-docs`: pass, 91 canonical rows.
- `pnpm typecheck`: pass.
- `actionlint .github/workflows/*.yml`: pass.
- `git diff --check`: pass before commit.
- `pnpm test`: pass, 69 files and 802 tests.
- `pnpm build`: pass; existing Radix `use client` warnings only.
- `env -u ELECTRON_RUN_AS_NODE pnpm test:e2e`: pass, 18 tests.
- `pnpm audit:deps`: pass; no known high-or-greater production vulnerabilities.
- `pnpm audit:source`: pass; 105 files checked.

Two installer tests exceeded Vitest's five-second default only under an earlier parallel full-suite run after the added identity subprocesses. The transaction suite now has a scoped 30-second timeout; the final focused suite and full 802-test run both pass.

## Concerns and external handoff

- No Apple Team ID is required or blocked; this is the explicit product decision.
- Before any release tag or tag-triggered draft, the repository owner must create/integrate the public origin as planned, enable immutable releases, and verify the repository `GET` reports `enabled: true`.
- Source verification does not prove a release is published, immutable, physically accepted, or that the canonical curl installer is live.
