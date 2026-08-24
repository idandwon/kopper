# Kopper Unsigned Friends Release Implementation Report

## Scope

Implemented the approved unsigned friends-beta installer and release path. No public tag, draft, publication, or physical-Mac acceptance is claimed in this local implementation report.

## Commits

| Task | Commit | Result |
| --- | --- | --- |
| Installer | `f807a6f76392642f736069b25759a5a308dee02c` | Current focused GREEN: `pnpm exec vitest run scripts/install.test.ts scripts/workflows.test.ts` exited 0; the two requested files contain 29 installer and 17 workflow tests, all passing. A RED state is not re-created on current HEAD. |
| Draft workflow | `b9e9bcda8c5bb5ab3ec3f85f2711507b1b9ea821` | Current focused GREEN: the same focused command exited 0 with all 17 workflow tests passing. A RED state is not re-created on current HEAD. |
| Promotion | `2b77ad7a878144e39cd2fdbdc5e8c8958fedaaca` | Current focused GREEN: the same focused command exited 0 with all 17 workflow tests passing, including exact draft-asset and immutable-publication assertions. A RED state is not re-created on current HEAD. |
| Documentation | `867874e3655d199250fe74d2f2535364d914f42e`, fix `194af4a91ebd2b9614936b89f41241cfbade43fb` | `pnpm validate:release-docs` exited 0: `Release documentation traceability valid: 91 canonical rows match in 2 acceptance records.` Current safety scans are recorded below. |

All commit IDs above were resolved with `git rev-parse` on the current feature branch. The report intentionally records only fresh current-HEAD execution evidence; it does not reuse historical RED output.

## Verification

| Command | Result | Exact evidence |
| --- | --- | --- |
| Focused Vitest | Pass | `pnpm exec vitest run scripts/install.test.ts scripts/workflows.test.ts` exited 0 (`vitest: ok`). A fresh JSON reporter run of the same two files reports 2 files, 46 passed tests, 0 failed: `scripts/install.test.ts` 29 and `scripts/workflows.test.ts` 17. |
| Full Vitest | Pass | `pnpm test` exited 0. A fresh JSON reporter run of the same full suite reports 68 files, 796 passed tests, and 0 failed tests. |
| Typecheck/build/E2E | Pass | `pnpm typecheck` exited 0. `pnpm build` exited 0 and produced main, preload, and renderer bundles; Rollup emitted non-fatal Radix `"use client"` module-directive warnings. `env -u ELECTRON_RUN_AS_NODE pnpm test:e2e` exited 0: 18 of 18 Playwright tests passed. |
| Installer/docs/workflows | Pass | `pnpm verify:installer` exited 0 (`bash -n install.sh`); `pnpm validate:release-docs` exited 0 with 91 canonical rows in 2 acceptance records; `pnpm exec actionlint .github/workflows/ci.yml .github/workflows/release.yml .github/workflows/promote-release.yml` exited 0 with no output. |
| Dependency/source audits | Pass | `pnpm audit:deps` exited 0: `No known vulnerabilities found`. `pnpm audit:source` exited 0 with `{ "ok": true, "source": "src", "checks": { "files": 105 }, "failures": [] }`. |
| Diff hygiene | Pass | `git diff --check d56f4ab..HEAD` exited 0 with no output. |

## Safety review

- Fixed public origin: the required scan found `README.md:10` using `https://github.com/idandwon/kopper/releases/latest/download/install.sh` and `install.sh:4` defining `KOPPER_REPOSITORY="idandwon/kopper"`; installer tests use the same origin at lines 100, 352, 385, and 386.
- Credential/signing scan scope: the required scan covered `.github`, `package.json`, `scripts`, `install.sh`, `README.md`, and the two unsigned installer documents; it did not cover `electron-builder.yml`. Within that scope it returned only `README.md:67` (explicitly says no repository or environment secrets) and `scripts/workflows.test.ts:76` (a negative assertion), so it establishes only that those scanned active release-path files contain no credential, signing, notarization, or stapling use.
- Unsigned beta override: `electron-builder.yml:19` sets `gatekeeperAssess: false` and `electron-builder.yml:20` has the builder default `notarize: true`. The `package:beta` invocation explicitly overrides the beta build with `pnpm build && electron-builder --mac dmg --universal -c.mac.identity=null -c.mac.notarize=false`; the focused workflow contract test asserts both override flags. This is an override for the unsigned beta command, not a claim that the shared builder configuration itself lacks a notarization default.
- Installer never bypasses Gatekeeper or removes quarantine: the required scan returned documentation prohibitions in `README.md:15`, `tests/manual/macos-installer.md:5`, and `docs/releases/installer-acceptance-template.md:40`, plus negative test assertions for `codesign` and `spctl` in `scripts/install.test.ts:378-379`; it returned no installer execution of those commands.
- Producer/consumer identity: the fixed-origin/bundle scan found `install.sh:8` and installer tests using `com.kopper.app`. The exact artifact name is constructed consistently as `Kopper-${version}-universal.dmg` in `install.sh:44`, `.github/workflows/release.yml:72`, and `.github/workflows/promote-release.yml:58`, with the matching `${VERSION}` consumer checks in `tests/manual/macos-installer.md:31-42,94`.
- Draft-first and immutable-publication controls retained: current focused workflow tests passed. Diff review confirms `release.yml` creates only `--draft` releases, promotion first requires exact tag, draft state, and exact three asset names, then verifies `isDraft=false` and `isImmutable=true` after its manual publish step.
- Installer rollback boundary: diff review confirms `transaction_phase="committed"` is set before the best-effort `open`; an `open` failure only writes the automatic-launch warning, so it cannot enter rollback after commit.
- Historical signed evidence: `docs/releases/v0.1.0-acceptance.md` changes are an append-only six-line superseding unsigned-beta decision; its prior signed evidence was not rewritten as passed.

## External handoff

- Push/CI: Not run until Task 6.
- Tag workflow/draft: Not run until Task 6.
- Physical unsigned acceptance: Not run until Task 6.
- Immutable promotion: Requires fresh explicit approval after draft inspection.
