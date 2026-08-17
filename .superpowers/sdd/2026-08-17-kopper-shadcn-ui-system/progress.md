# SDD ledger — plan: docs/superpowers/plans/2026-08-17-kopper-shadcn-ui-system.md

## Workspace

- Worktree: `/Users/idandaniel/Documents/code/kopper/.worktrees/shadcn-ui-system`
- Branch: `feature/shadcn-ui-system`
- Merge base / plan head: `2116862`
- Spec: `docs/superpowers/specs/2026-08-17-kopper-shadcn-ui-system-design.md`
- Baseline: `pnpm test` Pass (64 files, 714 tests); `pnpm typecheck` Pass.

## Preflight: task/interface overlap

| Tasks | Producer → consumer / shared seam | Finding |
| --- | --- | --- |
| 1 → 2 | Shared Tabs, ScrollArea, bounded overlays → full-panel Settings | Compatible; Task 2 consumes Task 1 primitives without redefining tokens. |
| 1 → 3 | Label, RadioGroup, Separator, bounded Select/Dialog → settings forms | Compatible; Task 3 owns feature composition and keeps primitive interfaces generic. |
| 1 → 4 | Textarea, ToggleGroup, Tooltip, Label, Select → panel/editor controls | Compatible; product-specific note/composer composition remains outside primitives. |
| 1 → 5 | Toast and bounded portals → PanelFeedback and capture feedback | Compatible; one controlled viewport per provider is explicit. |
| 1 → 6 | ScrollArea and overlay containment → secondary surfaces | Compatible; Task 6 supplies surface ownership, not competing primitives. |
| 2 → 3 | `SettingsPage` shell → responsive tab contents | Compatible; Task 3 does not take route ownership. |
| 2 → 4 | `PanelHeader` refs/lifecycle seam → ToggleGroup and shared controls | Compatible; Task 4 retains lifted refs and only changes rendered primitives. |
| 2 → 5 | `PanelMenu` navigation callback → shared pin feedback | Compatible; Task 5 must not restore local Settings ownership. |
| 2 → 6 | `DocumentPanel` hidden notes/settings route → explicit visible scroll owners | Compatible; Task 6 marks both owners and tests only the visible owner. |
| 2 → 7 | Route and focus contract → Settings E2E round trip | Compatible; tests consume exact Appearance/menu and Shortcuts/status entry behavior. |
| 3 → 7 | Narrow settings layout → minimum-size geometry/screenshots | Compatible; Task 7 is the pixel gate for Task 3's unit-level semantics. |
| 4 → 6 | `MarkdownEditor` and expanded editor → secondary scroll containment | Compatible; Task 6 may wrap content but must preserve Task 4 discard dialog. |
| 4 → 7 | Main-panel controls → keyboard journey and existing snapshots | Compatible; snapshot updates require visual inspection, not automatic acceptance. |
| 5 → 6 | Route CSS and feedback overlays → page shell overflow rules | Compatible; capture-HUD CSS remains route-scoped. |
| 5 → 7 | Toast/HUD geometry → overflow/security evidence | Compatible; HUD unit/security checks supplement renderer E2E. |
| 6 → 7 | `data-scroll-owner` contracts → `expectSurfaceContained` | Compatible; helper filters hidden owners and Radix sentinels. |
| 7 → 8 | Complete tested diff → whole-range review | Compatible; review uses plan base `09057d8` as specified, which includes the approved spec but predates worktree setup commit; diff review will also include `.gitignore` only if range derived literally. |
| 8 → 9 | Final production/test commit → exact-source unsigned gate/evidence | Compatible; latest commit touching `src`, `tests`, or package inputs defines tested source. |

## Preflight: task self-consistency

| Task | Tests versus implementation; files versus outputs | Finding |
| --- | --- | --- |
| 1 | New primitive tests precede seven primitive files and bounded overlays. | Consistent. ToggleGroup is tested as a pressed button, matching Radix semantics. |
| 2 | App/Settings tests precede route types, full page, hidden notes subtree, and focus refs. | Consistent. Hidden subtree preserves selection and local draft while remaining inaccessible. |
| 3 | Existing settings tests gain long-content/control expectations before form migration. | Consistent. No provider or persistence boundary changes. |
| 4 | User behavior tests precede main control conversion and discard AlertDialog. | Consistent. Circular lifecycle control remains feature-owned. |
| 5 | Feedback/HUD tests precede toast provider and route-classifier changes. | Consistent. Existing HUD window bounds/security are retained. |
| 6 | Component semantics tests precede one-scroll-owner changes. | Consistent. Pixel containment is intentionally deferred to Task 7. |
| 7 | Geometry helper and Settings journey run red before baselines update. | Consistent. Two full E2E passes and fixture cleanup are required. |
| 8 | Whole-range review precedes any fix and each fix requires a red/green test. | Consistent. Review artifacts are plan-scoped and ignored unless force-added. |
| 9 | Exact source is derived before a full unsigned gate and evidence-only commits. | Consistent. Protected and physical rows remain `Not run`. |

## Preflight rulings

- Ruling: Task 8's literal `BASE_SHA=09057d8` predates the worktree setup commit `2116862`; use `09057d8` for specification-range review as written, but classify the one-line `.gitignore` worktree setup as infrastructure, not UI scope — this may add harmless review noise if wrong, but avoids silently changing the approved review boundary.
- Ruling: Keeping the notes subtree mounted with the HTML `hidden` attribute satisfies “Settings replaces the complete panel page” because it is neither rendered nor accessible while Settings is active; it is required to preserve selection and an unflushed local composer draft — if wrong, the cost is a later refactor to lift feature state into `DocumentPanel`.

## Tasks

- Task 1: fix round 1/5 (3 addressed, 0 open — dialog reachability, Select clamp, explicit vertical ScrollBar deduplication; commits 17ede7f..4c2703e)
- Task 1: reviewer ⚠ cross-task items (window security/sizing, Settings replacement, pin persistence, authoritative mutations) are owned by Tasks 2, 5, 7, and final review; no Task 1 gap confirmed.
- Task 1: complete (commits 2116862..4c2703e, scoped re-review clean; 65 files / 724 tests and typecheck reported Pass)
- Task 2: fix round 1/5 (1 addressed, 0 open — close notes-owned Add Section portal on native Settings route; commits b27e0f6..017cf8f)
- Task 2: complete (commits 4c2703e..017cf8f, scoped re-review clean; 66 files / 731 tests and typecheck reported Pass)
- Task 3: minor (deferred to Task 7/final review): responsive component tests assert class contracts rather than real 308px geometry; Task 7 is the Playwright pixel gate.
- Task 3: minor (deferred): custom-theme Edit/Delete menu and failed-deletion interaction lack direct unit coverage; final review must triage after E2E.
- Task 3: complete (commits 017cf8f..73bba05, review approved; 66 files / 737 tests and typecheck reported Pass)
- Task 4: minor (deferred): completed lifecycle marker may inherit generic ghost hover background; final review must triage visual impact.
- Task 4: fix round 1/5 (2 addressed, 0 open — SearchField shrinking seam and real Completed-view switch coverage; commits 2bb01dc..5ff0b61)
- Task 4: complete (commits 73bba05..5ff0b61, scoped re-review clean; 66 files / 741 tests and typecheck reported Pass)
- Task 5: minor (deferred): PanelFeedback unmount cleanup and Radix onOpenChange timer cancellation lack direct behavior assertions; final review must triage.
- Task 5: fix round 1/5 (3 addressed, 0 open — single Radix-owned announcement channel, CaptureToast containment hunk, fallback HUD bounds regression; commits be4cbb6..f5f2ec3)
- Task 5: complete (commits 5ff0b61..f5f2ec3, scoped re-review clean; 67 files / 746 tests and typecheck reported Pass)
- Task 6: fix round 1/5 (1 addressed, 0 open — fresh pristine full-suite evidence; no source diff, HEAD e74ab3a)
- Task 6: complete (commits f5f2ec3..e74ab3a, scoped evidence re-review clean; 67 files / 748 tests, 29 renderer files / 202 tests, and typecheck reported Pass)
- Task 7: fix round 1/5 (2 addressed, 0 open — explicit lifecycle pressed state and clean 340×480 notes/composer boundary; commits ee42047..21488da)
- Task 7: resolved Task 3 deferred geometry minor with real 308px/340px Playwright bounds across settings, menus, dialogs, editor, onboarding, and recovery.
- Task 7: resolved Task 3 custom-theme menu coverage minor through real action-menu/delete-alert E2E containment and interaction coverage.
- Task 7: complete (commits e74ab3a..21488da, scoped visual re-review clean; 12 E2E journeys passed twice, six changed/new images inspected, cleanup Pass)
- Task 8: whole-range review at 21488da found 5 Important findings (theme preview forced-unmount cleanup; Radix Select Escape ownership; long section names; shortcut candidate tab retention; native Settings/HUD Electron evidence) and confirmed 2 Minors (completed hover token; feedback cleanup tests).
- Task 8: final fix wave complete — source `f22d485da218a47e1574fd281ffacf26e246e498`, tree `92e85fb878d9cc05d1ef45c6f1f9d66d2af10916`; 5 Important and 2 Minor findings addressed; 69 files / 758 tests, typecheck/build, 15 E2E, source audit, diff hygiene reported Pass.
- Task 8: Ruling: accept split automated evidence for the non-automatable native status-item boundary (live fixed main-process event E2E plus real WindowManager status callback unit test), while keeping a physical status-item click explicitly unclaimed — if wrong, exact-source automation overstates that one native click seam, but protected/physical release rows remain blocked and must still observe it.
- Task 8: complete (source commit f22d485; review docs 18471e3; scoped re-review clean and persisted at b5ee0ce).
- Task 9: blocked at exact-source gate `f22d485` (2026-08-17T14:55:35Z–14:56:14Z): unit/typecheck/build Pass; E2E 14 Pass / 1 Fail because composer expected empty after first Meta+Enter but received `r`; later audit/package/evidence steps Not run; evidence docs unchanged.
- Task 9: composer failure root cause confirmed as host keyboard leakage into the visible, intentionally focused real Electron textarea; temporary boundary instrumentation showed native input events absent from Playwright actions and correctly persisted as new draft text. Production behavior was correct.
- Task 9: test isolation correction `2828fa4` hides the Electron app while Playwright drives renderer keyboard/DOM focus; exact journey passed 50/50, full unit/typecheck/15 E2E Pass, cleanup Pass; fresh scoped review approved with no findings.
- Task 9: fresh exact-source gate complete at test/source commit `2828fa40f69478a11e5e99f61afe0fd046deeb7d` (tree `2fb3f0279134cc1ced9dadd27f62558435b23a01`); tested commit time `2026-08-17T18:12:33+03:00`.
- Task 9: fix round 1/5 (2 evidence-record findings addressed, 0 open — current leading status plus complete post-commit verification; no source/tracked diff); scoped re-review clean.
- Task 9: complete (source/test commit 2828fa4; evidence commit 2c9158a; milestone commit 972acd1; 69 files / 758 tests, 15 E2E, complete unsigned universal gate Pass; release Incomplete/Blocked).

## Final commit inventory

- `17ede7f80ecdd9925f9157c5c3aa18dcfd7a2379` — `feat: establish shadcn surface primitives`
- `4c2703eb6176d4298bde69c5c58e8e327a0d3bec` — `fix: close primitive review findings`
- `b27e0f62c7a2dffa1cdc9a00069ac54fe225499a` — `feat: replace settings drawer with panel page`
- `017cf8fa41faf8a638f939318c65b89f3d488bd1` — `fix: close notes overlays for settings route`
- `73bba05c79e9d928664b2fad5196f701bc0e69a0` — `feat: standardize responsive settings controls`
- `2bb01dce2475e1c87567b8d3056230977fffef34` — `feat: standardize panel interaction controls`
- `5ff0b61c8bd6d46c8642f0e9fa47934006a5b07f` — `fix: close panel control review findings`
- `be4cbb68b510fc9fe952bc4645e504d1eacb8433` — `feat: unify panel feedback surfaces`
- `f5f2ec368024b0ef894228101234bd925018108b` — `fix: close feedback review findings`
- `e74ab3a2c99125c75622d841c1eafae46d48e9f5` — `fix: contain secondary renderer surfaces`
- `ee420478eed46a15607b05e5880880957fea093b` — `test: enforce renderer overflow contract`
- `21488da6869cd9967cf68b9067b032239f9798bf` — `fix: close visual evidence review findings`
- `f22d485da218a47e1574fd281ffacf26e246e498` — `fix: close shadcn UI review findings`
- `18471e3384e527ff0059cf03cf87e3a01b2977ca` — `docs: record shadcn UI system review`
- `b5ee0ce13652d6c8abcb872861c00b55d3e51544` — `docs: record shadcn UI fix re-review`
- `2828fa40f69478a11e5e99f61afe0fd046deeb7d` — `test: isolate composer parity from host keyboard`
- `2c9158a80791d45a6957ea1f0e9ca7b8a4d69d43` — `docs: refresh shadcn UI evidence pointers`
- Final milestone ledger — `docs: close shadcn UI system milestone` (this plan-scoped ledger commit; identify by subject in history).

## Task 9 gate history and debug ruling

- Historical partial run only: started `2026-08-17T14:55:35Z`; failure/log end `2026-08-17T14:56:14Z`; the shell emitted no `RUN_END`. Unit 69 files / 758 tests, typecheck, and build (main 38 / preload 240 / renderer 680 modules) passed; E2E stopped the ordered gate at 14 passed / 1 failed. Audits, 91-row validator, actionlint, unsigned packaging, verifier, and evidence updates were not run. This partial run was never combined with release evidence.
- Debug ruling: the visible Electron window delivered unrelated host keyboard events to the intentionally focused composer. The repository acknowledged `note.add` and `draft.clear`; production correctly retained later genuine input. This was test-isolation misuse, not a production acknowledgement/persistence race. Temporary instrumentation was removed. The approved correction at `2828fa4` calls Electron `app.hide()` before Playwright's renderer keyboard loop; no production `src`, package, lockfile, build, persistence, timing, retry, or tolerance change was made. Focused component 16/16 and corrected journey 50/50 passed; independent debug re-review approved with no findings.

## Fresh successful exact-source gate

- One new ordered run only: `RUN_START=2026-08-17T15:18:00Z`; `RUN_END=2026-08-17T15:19:38Z`.
- `pnpm test`: Pass — Vitest 4.1.10, 69 files / 758 tests, 7.54 s.
- `pnpm typecheck`: Pass — `tsc -b --pretty false`, no diagnostics.
- `pnpm build`: Pass — main 38 modules / 147.40 kB; preload 240 modules / 256.93 kB; renderer 680 modules / CSS 50.47 kB / JS 1,877.87 kB; dependency-level ignored `use client` warnings only.
- `pnpm test:e2e`: Pass — 15/15 with one worker, 24.7 s.
- `pnpm audit:deps`: Pass — no known vulnerabilities.
- `pnpm audit:source`: Pass — `ok: true`, 102 source files, zero failures.
- `pnpm validate:release-docs`: Pass — 91 canonical rows match both acceptance records.
- `actionlint .github/workflows/*.yml`: Pass — no findings/output.
- `pnpm package:unsigned`: Pass — universal directory app at `release/mac-universal/Kopper.app`; x64 and arm64 native dependencies rebuilt; signing explicitly skipped because identity was null.
- `pnpm verify:package "release/mac-universal/Kopper.app"`: Pass — 3,172 ASAR entries; exact `arm64` and `x86_64`; one active native module; application ID `com.kopper.app`; minimum macOS 14.0; zero failures.
- Cleanup: no surviving process matching `kopper-e2e-*` or `out/main/index.js`; no `kopper-e2e-*` or `kopper-dialog-outside-*` host-temp fixture; generated `test-results/` removed.
- Evidence pointer commit `2c9158a80791d45a6957ea1f0e9ca7b8a4d69d43` changes only the two release evidence documents. This ledger commit is plan-scoped documentation. Neither changes production/package source after exact source `2828fa4`.

## Final visual inventory and reviews

- Notes baselines: `oxide-ledger-{light,dark}-{380x640,340x480}-darwin.png` under `tests/e2e/demo-parity.spec.ts-snapshots/`.
- Settings baselines: `oxide-ledger-settings-{light,dark}-{380x640,340x480}-darwin.png` in the same directory.
- Task 7 inspected all six new/changed images at native resolution, then fixed the lifecycle pressed-state proof and the 340×480 notes/composer evidence boundary; both corrected 340×480 images were reinspected. Task 8 inspected all eight final native-resolution images and found no masks, overlap, horizontal clipping, or Oxide Ledger identity drift; fresh screenshots matched without updates.
- Scoped reviews: Tasks 1, 2, 4, 5, 6, and 7 closed their requested fix rounds; Task 3 was approved with deferred coverage resolved by Task 7. Task 8's whole-range review found five Important and two Minor items; `f22d485` addressed all seven, and the persisted re-review was clean. The Task 9 debug correction received an independent clean approval.
- Status-item boundary ruling: automated evidence is deliberately split across the fixed live main-process event Electron journey and the real WindowManager status callback unit test. Playwright did not click the physical macOS status item. That physical click remains explicitly unclaimed and `Not run`.

## Final milestone ruling

- **Release status: Incomplete — blocked; do not publish or promote.** The fresh exact-source unsigned gate passed, but it does not resolve prior promotion-workflow defects or substitute for an exact release tag, protected signing/notarization/stapling/Gatekeeper evidence, protected artifact checks, physical macOS acceptance, VoiceOver/accessibility review, independent acceptance approval, or promotion authorization.
- Every protected, physical, signing, notarization, stapling, Gatekeeper, VoiceOver, independent approval, and promotion row remains `Not run`; the canonical 91-row procedure is unchanged.
- No signing, notarization, stapling, publishing, promotion, push, merge, workflow alteration, or protected release action was performed.

## Final whole-branch review and permitted fix wave

- Final reviewer record at starting clean HEAD `cc7762dfa102deb663509f588e27885f63d2b057` found 3 Important items and 1 Minor test debt: notes-owned portals escaping mounted-hidden routing; nested Markdown horizontal owners; Settings failures announced as status; and missing direct failed custom-theme deletion coverage.
- One permitted TDD source wave addressed all four findings. Focused RED was 4 failed files / 12 failed and 36 passed component tests; focused Electron RED was 1/1 failed with a 5252.078125 px descendant right edge at 340 px. Focused GREEN was 9 files / 75 component tests, 1/1 Markdown Electron journey, and typecheck Pass.
- Final source/test commit: `6054d26965ce66d924079cbcd4fb28dbcb05b38c` — `fix: close final shadcn UI findings`; tree `c7f57763fbebcc7dd288b40f1127344bbf987c41`; commit time `2026-08-17T18:55:24+03:00`.
- Portal disposition: `DocumentPanel` owns one notes-surface visibility provider consumed by panel/Add Section/SectionManager/note/editor portal roots, including submenus, Selects, and tooltips. Native listener tests prove Shortcuts is the sole visible/accessibility surface, Back entry focus and Search restoration are deterministic, and editor/selection/composer state survives.
- Markdown disposition: code pre-wraps anywhere; 100%-width fixed-layout GFM tables and cells wrap; adversarial full-content tests pass at 340×480 notes and 420×480 editor with no root or Markdown-descendant horizontal owner.
- Settings disposition: shared `{ text, tone: "status" | "error" }` feedback gives failures alert semantics and progress/success/cancel polite status semantics across Appearance, Data, and Shortcuts. Direct failed custom-theme deletion keeps the authoritative row and open retry action.
- Precommit validation: 69 files / 766 unit tests Pass; typecheck/build Pass with main 38 / preload 240 / renderer 682 modules; 16/16 Electron E2E Pass. All eight notes/Settings baselines matched; no screenshot, mask, or tolerance changed.

## Final fresh exact-source unsigned gate and evidence

- Completely fresh ordered interval: `RUN_START=2026-08-17T15:55:39Z`; `RUN_END=2026-08-17T15:57:14Z`.
- `pnpm test`: Pass — 69 files / 766 tests, 10.19 s.
- `pnpm typecheck`: Pass — no diagnostics.
- `pnpm build`: Pass — main 38 / preload 240 / renderer 682 modules; CSS 50.62 kB; renderer JS 1,882.44 kB; existing dependency-level ignored `use client` warnings only.
- `pnpm test:e2e`: Pass — 16/16 with one worker, 23.3 s.
- `pnpm audit:deps`: Pass — no known vulnerabilities.
- `pnpm audit:source`: Pass — `ok: true`, 104 source files, zero failures.
- `pnpm validate:release-docs`: Pass — 91 canonical rows in both acceptance records.
- `actionlint .github/workflows/*.yml`: Pass — no findings/output.
- `pnpm package:unsigned`: Pass — universal directory app produced; signing explicitly skipped because identity was null.
- `pnpm verify:package "release/mac-universal/Kopper.app"`: Pass — 3,172 ASAR entries; exact `arm64` and `x86_64`; one native module; ID `com.kopper.app`; minimum macOS 14.0; zero failures.
- Cleanup: no surviving E2E/app process, no E2E/dialog fixture directory, and no generated `test-results/`.
- Evidence commit: `e318a23f410bfe9d586f936d1ad5c207a80506ba` — `docs: refresh final shadcn UI evidence`; only the two release evidence documents changed.
- Branch review/fix record commit: `da6867db3c4e0b37a754a3968a65e789d11f5896` — `docs: record final shadcn UI branch review`; only the final reviewer record and final fix report changed.
- No production/package input differs after exact source `6054d269`. The tracked ledger commit carrying this section is documentation-only and is identified by subject `docs: finalize shadcn UI branch ledger`.

## Final release ruling after branch closure

- **Release remains Incomplete — blocked; do not publish or promote.** Automated source and unsigned packaging gates pass, but an exact release tag, protected signing/notarization/stapling/Gatekeeper artifact evidence, physical macOS matrices, physical status-item interaction, VoiceOver review, independent acceptance approval, and promotion authorization remain `Not run`.
- No workflow was altered and no signing, notarization, stapling, physical acceptance, publication, promotion, push, or merge was performed.

## Final scoped re-review residual

- Final fix re-review persisted at `448486b` verdicts the portal, Markdown, and Settings-feedback findings Addressed, but finds one new Important race in custom-theme deletion: Cancel/Escape and a second Delete remain enabled while `appearance.deleteCustomTheme` acknowledgement is pending, so failure can lose the open retry surface.
- Ruling: this residual is real and load-bearing for merge readiness; it is not adjudicated away. The single permitted final fix wave is exhausted, so no unreviewed second wave is launched. Branch remains **Not ready to merge** and the worktree is preserved for an explicitly authorized follow-up — if wrong, this conservatively delays integration; if ignored, users could dismiss or double-invoke a pending destructive theme operation.
- Release remains independently Incomplete/Blocked; exact gated source `6054d269` accurately passed its automated gate, but that evidence does not negate the merge blocker.
