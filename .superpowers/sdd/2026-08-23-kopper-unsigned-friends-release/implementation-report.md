# Kopper Unsigned Friends Release Implementation Report

## Scope and current state

Implemented the approved unsigned friends-beta installer and release path plus the consolidated final-review hardening at reviewed base `ddb2b02eba4ec2d3beec1099bf5826599f7957fe`. No merge, push, tag, GitHub Release draft/publication, workflow dispatch, or physical installation is claimed in this local report.

## Commits

| Task | Commit | Result |
| --- | --- | --- |
| Installer | `f807a6f76392642f736069b25759a5a308dee02c` | Unsigned product-identity installer with transaction commit before best-effort launch. |
| Initial draft workflow | `b9e9bcda8c5bb5ab3ec3f85f2711507b1b9ea821` | Initial unsigned build/draft implementation, superseded at the protected boundary by the final fix. |
| Initial promotion | `2b77ad7a878144e39cd2fdbdc5e8c8958fedaaca` | Initial unsigned draft promotion, superseded by accepted commit/hash binding and executable validation. |
| Documentation | `867874e3655d199250fe74d2f2535364d914f42e`, fixes `194af4a91ebd2b9614936b89f41241cfbade43fb`, `9804b17ba2a5e0746ec725f21c2636ba7d460584`, `ddb2b02eba4ec2d3beec1099bf5826599f7957fe` | Honest unsigned-beta guidance and preserved historical signed evidence. |
| Final review fix | `a631a7deea0b0bdc296711a6404080e08d184a6c` | Isolated build/publication jobs, non-executing protected boundaries, accepted commit/hash inputs, executable candidate fixtures, bundle-version check, strict physical scripts, and current operational docs. |

## Final architecture

- The tag workflow's `build_candidate` job has only `contents: read`, no release environment, and is the only job that installs dependencies or executes candidate package/repository code. It stages exactly the DMG, checksum, and installer in one workflow artifact.
- A fresh `publish_draft` job has `contents: write` plus `environment: release`. It uses pinned official actions and trusted inline shell/Node only, validates exact regular files/checksum/installer bytes against `git show "$GITHUB_SHA:install.sh"`, rechecks the remote tag, and creates the draft without executing candidate code.
- Manual promotion requires `tag`, `expected_commit`, and `expected_dmg_sha256`. It validates exact format, checkout/tag/package/remote identity, draft state, assets, installer bytes, checksum, and DMG hash; rechecks the remote tag immediately before publication; then freshly downloads and validates the same asset set/hash together with `isImmutable: true`.
- Package verification rejects a bundle whose `CFBundleShortVersionString` differs from the exact repository package version.
- The six physical acceptance Bash blocks are self-contained and strict, validate clean-account preconditions, use bounded temporary cleanup, assert exact app/architecture sets, and explicitly capture launch/install/refusal statuses without hiding `curl | bash` failures.

## TDD evidence

| Phase | Command | Result |
| --- | --- | --- |
| Workflow RED | `pnpm exec vitest run scripts/workflows.test.ts` | Expected exit 1: 21 failed and 13 passed. Failures named missing isolated jobs/steps, required inputs, Git-object comparison, executable validator, immutable re-download, and remote-tag checks. |
| Bundle-version RED | `pnpm exec vitest run scripts/verify-package.test.ts` | Expected exit 1: 1 failed and 165 passed because `CFBundleShortVersionString=0.1.1` was incorrectly accepted. |
| Focused GREEN | `pnpm exec vitest run scripts/install.test.ts scripts/workflows.test.ts scripts/verify-package.test.ts` | Exit 0: 3 files and 229 tests passed (29 installer, 34 workflow, 166 package). The workflow tests execute the embedded validator against accepted, non-draft, extra/missing asset, malformed/mismatched accepted value, replaced DMG/installer, moved tag, and mutable-publication fixtures. |

## Fresh verification

| Command | Result |
| --- | --- |
| `pnpm verify:installer` | Exit 0. |
| `pnpm validate:release-docs` | Exit 0: exactly 91 canonical rows match in 2 acceptance records. |
| `pnpm typecheck` | Exit 0. |
| `pnpm exec actionlint .github/workflows/ci.yml .github/workflows/release.yml .github/workflows/promote-release.yml` | Exit 0 with no output. |
| Syntax validation for every executable Bash block in `tests/manual/macos-installer.md` | Exit 0: 6 strict blocks passed `bash -n`. |
| `pnpm test` | Exit 0: 68 files and 814 tests passed. |
| `pnpm build` | Exit 0; main, preload, and renderer bundles built. Existing dependency-level Radix `"use client"` warnings remained non-fatal. |
| `env -u ELECTRON_RUN_AS_NODE pnpm test:e2e` | Exit 0: 18 of 18 Playwright tests passed. |
| `pnpm audit:deps` | Exit 0: no known vulnerabilities found. |
| `pnpm audit:source` | Exit 0: 105 source files checked, no failures. |
| `git diff --check 0d6070ac7b3741cdad4cc6d5886caa305524dc29..HEAD` | Exit 0 with no output after the final-review source commit. |

## Self-review and remaining concerns

- Reviewed the entire final-fix diff and rechecked job permissions/environments, action pins, exact asset parsing, expected-value data flow, tag peeling for lightweight/annotated tags, installer Git-object comparisons, pre/post-publication validation, package-version mutation coverage, strict physical cleanup/status behavior, active unsigned guidance, and append-only historical evidence.
- Active-path scans found no Apple credentials, signing/notarization command, `codesign`, `spctl`, `xattr`, `sudo`, quarantine removal, or Gatekeeper-disable execution. Documentation matches are prohibitions only.
- The workflows are locally validated but have not run on GitHub. Physical unsigned/Open Anyway acceptance is also unrun. The build still emits the pre-existing non-fatal Radix module-directive warnings.

## Exact external handoff

1. Controller performs the scoped final re-review; then an authorized owner may separately merge/push and require CI on the exact commit. None of those actions occurred here.
2. Before tagging, verify immutable releases and the protected `release` environment. Create the exact package-version tag only at the approved CI-green release commit, then inspect the generated three-asset draft.
3. Run `UNSIGNED-01` through `UNSIGNED-03` on a clean physical Mac and record the exact release commit as `expected_commit` plus the exact DMG SHA-256 as `expected_dmg_sha256` in the versioned acceptance record.
4. Stop for fresh publication approval. Only then dispatch **Promote Release** with `tag`, that recorded `expected_commit`, and that recorded `expected_dmg_sha256`; afterward complete `UNSIGNED-04` through `UNSIGNED-06` on a second clean account.
