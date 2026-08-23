# SDD ledger — plan: docs/superpowers/plans/2026-08-23-kopper-curl-installer.md

Workspace: `/Users/idandaniel/Documents/code/kopper/.worktrees/public-macos-installer`
Branch: `feature/public-macos-installer`
Merge base: `1574e5c`
Baseline: `pnpm test` passed — 68 files, 767 tests.

## Preflight scan

| Scope | Producer / requirement | Consumer / implementation | Finding |
| --- | --- | --- | --- |
| Task 1 self-check | Release resolution derives exact tag-specific asset URLs | Task 1 test expects both downloads to have occurred | Conflict: Task 1 implementation stops after URL derivation; actual downloads belong to Task 2. |
| Task 1 self-check | Test harness replaces external macOS/network commands | Tests assert installer exit status, output, fixed URL, and isolated-home effects | Clean: unavoidable boundaries are mocked while the real installer runs. |
| Tasks 1 → 2 | Task 1 creates `install.sh`, test harness, syntax command, and CI step | Task 2 extends the same script/harness into the transaction | Clean after the Task 1 download-test ruling below. |
| Task 2 self-check | Transaction code tracks staged/new/rollback state and shared cleanup | Failure tests require old app preservation and exact cleanup | Clean: set new-target state immediately after replacement and clean downloads before launch. |
| Tasks 1 → 3 | Task 1 adds CI installer syntax step | Task 3 locks CI order in workflow tests | Clean. |
| Tasks 2 → 3 | Task 2 produces final `install.sh` | Task 3 uploads and compares the exact tagged file | Clean. |
| Task 3 self-check | Release and promotion workflows require three assets | Validator and workflow fixtures require the same three names | Clean. |
| Tasks 1/2 → 4 | Installer behavior and exact destination are established | README and physical acceptance document the same contract | Clean. |
| Task 4 self-check | Human README prose is added | Plan mandates a source-text unit test for the prose | Conflict: test guidance forbids change-detector tests for human prose. |
| Tasks 1-4 → 5 | Source tasks produce the complete installer change | Task 5 verifies focused and full gates | Clean; Task 5 has no implementation diff and will feed the final review. |
| Tasks 1-5 → 6 | Verified feature branch contains the source change | Task 6 says create and push public repository from clean local `main` | Conflict: isolated execution is on a feature branch; public `main` must be created after integration, not from the worktree branch. |
| Task 6 self-check | Public repository and release environment are external state | Commands create repo, remote, push, and environment | Clean only after integration; user explicitly approved public `idandwon/kopper` and execution of this plan. |

Ruling: Defer Task 1's exact DMG/checksum download-URL assertion and `stopAfterDownloads` scenario to Task 2; Task 1 will prove valid exact-tag resolution reaches a successful derived state without downloading — the spec assigns downloads to the transaction flow — cost if wrong: the intermediate Task 1 commit has weaker asset-URL coverage, but Task 2 must prove both exact URLs before any release integration.

Ruling: Do not add Task 4's README source-text Vitest; human prose does not earn a change-detector test under the required test-quality guidance. Verify the exact README command and forbidden bypass absence during task review and Task 5 safety checks — cost if wrong: accidental README command drift would be caught by review rather than an automated unit test.

Ruling: Execute Task 6 only after the reviewed feature branch is integrated into local `main`; create and push public `idandwon/kopper` from that clean main checkout, then configure the release environment — this preserves the plan's public-main requirement and avoids publishing an unmerged feature branch — cost if wrong: GitHub publication occurs later than the task numbering suggests.

Ruling: Treat Task 5 as the no-diff completion gate feeding the required final whole-branch review, rather than dispatching a meaningless task reviewer against an empty range — cost if wrong: Task 5 has verification evidence and final review, but no separate per-task code-quality verdict because it changes no code.

Task 1: complete (commits 1574e5c..b185204, review clean)

Task 2: complete (commits b185204..3a2b266, review clean)

Task 3: complete (commits 3a2b266..eb0e9b8, review clean)

Task 4: complete (commits eb0e9b8..76a7087, review clean)
Task 5: complete (commits 76a7087..f3995d2; no feature diff was planned, but final verification found and fixed release-workflow shellcheck SC2129; all gates clean after the fix)

## Task 5 fresh verification at f3995d2
- `pnpm verify:installer`: passed.
- `pnpm validate:release-docs`: passed; 91 canonical rows match in 2 acceptance records.
- `pnpm typecheck`: passed.
- `pnpm test`: passed; 69 files, 789 tests.
- `pnpm build`: passed; existing Radix `use client` bundle warnings only.
- `env -u ELECTRON_RUN_AS_NODE pnpm test:e2e`: passed; 18 tests.
- `pnpm audit:deps`: passed; no known high-or-greater production vulnerabilities.
- `pnpm audit:source`: passed; 105 files checked.
- `actionlint .github/workflows/*.yml`: passed after grouping GitHub output writes in commit f3995d2.
- `git diff --check 1574e5c..HEAD`: passed.
- installer/README forbidden bypass scan (`sudo`, `xattr`, Gatekeeper disablement, `eval`, `source`): clean.

## Final whole-branch review at f3995d2
- Critical: published `install.sh` remains replaceable unless repository release immutability is enabled before the first release and the published release is verified immutable.
- Important: rollback state transitions are not signal-safe around final rename and backup deletion; current signal coverage does not reach those windows.
- Important: no complete successful-upgrade regression exists.
- Important: verification checks Apple acceptance but not exact Kopper bundle/version/publisher identity.
- Minor: the physical mount check truncates `hdiutil info` before evaluating all mounts.
- Minor: the v0.1.0 next-action handoff still says to upload only two assets.
- Verdict: not ready; one complete fix wave and one scoped re-review required.
User decision: Do not introduce an Apple Developer Team ID requirement. Product identity will use the immutable GitHub release, exact checksum, real app directory, exact bundle identifier/version, and existing codesign/Gatekeeper acceptance.

## Permitted final-review fix wave at f3995d2

- Scope remained local to `feature/public-macos-installer`; no repository, remote, tag, release, GitHub setting, environment, or secret mutation was performed.
- Immutable releases are now an explicit repository-owner prerequisite before the first release tag: Task 6 uses `PUT /repos/idandwon/kopper/immutable-releases`, independently verifies the `GET` result is `enabled: true`, retains draft-first/assets-first publication, and promotion requires the published exact-tag release to report `isImmutable: true` before the workflow can succeed.
- Product identity follows the explicit no-Team-ID decision: the installer requires a real non-symlink app directory, exact `com.kopper.app`, exact resolved release version, deep `codesign`, and Gatekeeper acceptance. Immutable exact-tag release provenance plus the verified DMG checksum identifies the distributed publisher artifact.
- The install transaction now has explicit `unmodified`, `rollback-ready`, `new-installed`, and `committed` phases. Signals are deferred across each filesystem/state update; a nonzero result after a completed rename is reconciled from the source/destination paths. Successful launch commits the new app before bounded rollback cleanup, so cleanup failure/interruption never deletes the verified new app or restores a partial old bundle.
- RED evidence: file/wrong-ID/wrong-version mounted apps installed successfully; a post-staged-rename signal left new and rollback paths inconsistent; committed rollback cleanup failure restored the old app; interrupted partial rollback cleanup removed a valid target; a disabled cleanup mutation left one rollback artifact after successful upgrade; the promotion workflow lacked the immutable verification step; and a mounted app-directory symlink installed successfully.
- A final self-review found that the tag workflow still relied only on the owner handoff before draft creation. Focused RED failed because `Verify repository immutable releases are enabled` was absent; a second focused RED required the current `X-GitHub-Api-Version: 2026-03-10` header. GREEN adds the versioned read-only `GET` guard immediately before draft creation and passes all 16 workflow tests.
- Focused GREEN evidence: identity cases 5/5; rename/commit cleanup cases 5/5 plus nonzero-after-rename signals 2/2; successful upgrade 1/1; immutable workflow checks 2/2; final focused suite 45/45.
- Final automated gates: installer syntax passed; release documentation traceability passed with 91 canonical rows; typecheck passed; actionlint passed; full unit suite passed with 69 files and 802 tests; build passed with only the existing Radix `use client` warnings; Electron E2E passed 18/18; production dependency audit found no known high-or-greater vulnerabilities; source audit passed across 105 files; and `git diff --check` passed.
- Test-harness timing note: after the additional identity processes, two installer cases exceeded Vitest's default five-second timeout only during parallel full-suite load. A scoped 30-second timeout was applied to the installer transaction suite; the final focused suite and full 802-test run are green.
