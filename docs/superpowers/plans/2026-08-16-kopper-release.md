# Kopper Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a secure, tested, universal, Developer ID-signed and notarized Kopper DMG with repeatable CI and a complete macOS acceptance record.

**Architecture:** Electron Builder creates the universal application and DMG with explicit hardened-runtime entitlements and privacy descriptions. Automated unit, renderer, integration, package, and security checks run before a credentialed release job signs and notarizes; real Accessibility behavior remains a documented physical-mac acceptance gate.

**Tech Stack:** Electron Builder, Playwright, Vitest, GitHub Actions, Apple codesign/notarytool/stapler, pnpm

**Spec:** `docs/superpowers/specs/2026-08-16-kopper-design.md`

## Global Constraints

- Complete the foundation, note-workflow, theme, and macOS-capture plans first.
- Target macOS 14 Sonoma and later and distribute directly, not through the Mac App Store.
- Produce a universal signed `.app` and notarized `.dmg` with hardened runtime.
- Do not add accounts, synchronization, analytics, telemetry, crash reporting, remote renderer content, or automatic updates.
- Signing credentials exist only in the release environment and must never enter repository files or logs.
- A release is incomplete until real capture passes in Chrome, ChatGPT, Claude, Cursor, TextEdit, and another native text application.
- Use test-driven development and commit after every task.

---

## Locked File Structure

```text
build/icon.svg                         Editable original Kopper icon source
build/icon.icns                        Packaged macOS icon
build/entitlements.mac.plist           Main hardened-runtime entitlements
build/entitlements.mac.inherit.plist   Child-process entitlements
electron-builder.yml                   Universal DMG, signing, and notarization
scripts/build-icons.mjs                Deterministic icon generation
scripts/verify-package.mjs             Bundle metadata and forbidden-content checks
scripts/verify-package.test.ts         Package verifier tests
scripts/release.mjs                    Local release preflight and build command
src/main/security/securityPolicy.test.ts Static security regression tests
tests/e2e/document-workflows.spec.ts   Persisted note and section journeys
tests/e2e/theme-workflows.spec.ts      Appearance and theme journeys
tests/e2e/recovery.spec.ts             Malformed and imported data journeys
tests/e2e/security.spec.ts             Renderer isolation and CSP checks
tests/manual/macos-capture.md          Physical-machine acceptance procedure
docs/releases/acceptance-template.md   Versioned release evidence template
.github/workflows/ci.yml                Pull-request and branch verification
.github/workflows/release.yml           Tag-driven signed/notarized release
```

## Task 1: Configure Hardened Universal Packaging

**Files:**

- Create: `build/icon.svg`
- Create: `scripts/build-icons.mjs`
- Create: `build/entitlements.mac.plist`
- Create: `build/entitlements.mac.inherit.plist`
- Modify: `electron-builder.yml`
- Modify: `package.json`
- Create: `scripts/verify-package.test.ts`
- Create: `scripts/verify-package.mjs`

**Interfaces:**

- Consumes: built `out/**`, native `uiohook-napi`, and Apple signing environment variables.
- Produces: `pnpm icons`, `pnpm package:unsigned`, `pnpm package:release`, and `pnpm verify:package`.

- [ ] **Step 1: Write failing package-verifier tests**

Create temporary fake bundles and assert the verifier fails when:

- `CFBundleIdentifier` is not `com.kopper.app`
- `LSMinimumSystemVersion` is not `14.0`
- `NSAppleEventsUsageDescription` is absent
- renderer files contain `http://` or `https://` remote script sources
- `uiohook-napi` native binaries are missing
- an updater package or auto-update configuration is present

Assert a complete fake bundle returns exit code 0 and a JSON summary.

- [ ] **Step 2: Run verifier tests and verify failure**

Run: `pnpm vitest run scripts/verify-package.test.ts`

Expected: FAIL because `verify-package.mjs` does not exist.

- [ ] **Step 3: Implement package verification**

The verifier accepts one `.app` path, reads `Contents/Info.plist` with `/usr/bin/plutil -convert json -o -`, scans `Contents/Resources/app.asar` only through `pnpm exec asar list` rather than extracting into the repository, checks `Contents/Resources/app.asar.unpacked/node_modules/uiohook-napi`, and prints structured failures without environment values. Add `@electron/asar` as a development dependency so the command is pinned in `pnpm-lock.yaml`.

- [ ] **Step 4: Add explicit hardened-runtime entitlements**

Both plist files must enable only Electron runtime requirements:

```xml
<key>com.apple.security.cs.allow-jit</key><true/>
<key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
<key>com.apple.security.cs.disable-library-validation</key><true/>
```

Do not enable App Sandbox, network server, camera, microphone, contacts, location, or file-wide user-selected access entitlements.

- [ ] **Step 5: Add the original application icon**

Create a square SVG using the approved Oxide Ledger visual language: mineral rounded square, one raw-copper vertical rail transitioning to verdigris, and a dark-oxide inset `K` formed from simple paths. Include no Copper or shadcn marks. `scripts/build-icons.mjs` renders 16 through 1024 pixel PNG sizes with `sharp`, creates an iconset, and runs `/usr/bin/iconutil -c icns`.

Run:

```bash
pnpm add -D sharp
pnpm icons
```

Expected: `build/icon.icns` exists and icon generation exits 0.

- [ ] **Step 6: Configure Electron Builder**

Set:

```yaml
appId: com.kopper.app
productName: Kopper
artifactName: Kopper-${version}-${arch}.${ext}
directories:
  output: release
asar: true
asarUnpack:
  - node_modules/uiohook-napi/**
mac:
  icon: build/icon.icns
  category: public.app-category.productivity
  minimumSystemVersion: "14.0"
  hardenedRuntime: true
  gatekeeperAssess: false
  notarize: true
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.inherit.plist
  target:
    - target: dmg
      arch:
        - universal
  extendInfo:
    NSAppleEventsUsageDescription: Kopper uses System Events only when you invoke capture, so it can copy the text you selected.
    NSHumanReadableCopyright: Copyright © 2026 Kopper contributors.
dmg:
  sign: false
```

Use Electron Builder’s built-in `mac.notarize: true`; do not add a custom `afterSign` hook. Credentialed builds read `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`. The explicit unsigned development command overrides notarization with `-c.mac.notarize=false`.

- [ ] **Step 7: Add package scripts**

```json
{
  "icons": "node scripts/build-icons.mjs",
  "package:unsigned": "pnpm build && electron-builder --mac dir --universal -c.mac.identity=null -c.mac.notarize=false",
  "package:release": "node scripts/release.mjs",
  "verify:package": "node scripts/verify-package.mjs"
}
```

`release.mjs` verifies darwin, a clean Git worktree, an exact `v${package.version}` tag, all three Apple API-key environment variable names, then runs tests, build, `electron-builder --mac dmg --universal`, package verification, `codesign --verify --deep --strict`, `spctl --assess --type execute`, and `xcrun stapler validate`.

- [ ] **Step 8: Run unsigned packaging verification**

Run:

```bash
pnpm test
pnpm icons
pnpm package:unsigned
pnpm verify:package "release/mac-universal/Kopper.app"
```

Expected: all commands exit 0; signature/notarization checks are skipped only because this is the explicit unsigned command.

- [ ] **Step 9: Commit packaging hardening**

```bash
git add build scripts electron-builder.yml package.json pnpm-lock.yaml
 git commit -m "build: harden universal macOS packaging"
```

## Task 2: Complete Electron End-to-End Coverage

**Files:**

- Create: `tests/e2e/fixtures/electronApp.ts`
- Create: `tests/e2e/document-workflows.spec.ts`
- Create: `tests/e2e/theme-workflows.spec.ts`
- Create: `tests/e2e/recovery.spec.ts`
- Create: `tests/e2e/security.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `src/main/index.ts`

**Interfaces:**

- Consumes: built Electron entry point and temporary per-test user-data directories.
- Produces: isolated Playwright fixtures with `launchKopper(initialDocument?)`, `readPersistedDocument()`, and `closeKopper()`.

- [ ] **Step 1: Write a failing isolated-launch fixture test**

Assert two launches use different temporary `--user-data-dir` paths, closing removes the temporary directory after reading evidence, and initial documents are written before app launch. No test may read or mutate the developer’s real Application Support directory.

- [ ] **Step 2: Implement the Electron fixture**

Launch with Playwright `_electron.launch({ args: [mainPath, "--user-data-dir=..."] })`. Use one worker per macOS runner. Provide methods that interact only through the rendered UI except the explicit persisted-document assertion after application close.

- [ ] **Step 3: Add document workflow journeys**

Test through accessible roles:

1. Add two sections and three notes.
2. Rename and reorder a section.
3. Search for one note.
4. Multi-select two notes, copy as list, merge, undo, and merge again.
5. Complete and restore a note.
6. Move and delete a note, then undo.
7. Relaunch and assert the acknowledged final state persists.

Use Electron clipboard readback from the Playwright main-process evaluation only for the copy assertion.

- [ ] **Step 4: Add theme workflow journeys**

Switch System/Light/Dark, activate every bundled preset, edit one custom color and radius, verify a contrast failure blocks save, save a valid custom theme, export it, reset the theme, import the file, preview, cancel, import again, save, and verify the active theme survives relaunch.

- [ ] **Step 5: Add recovery journeys**

Start with malformed JSON and assert the app never changes its bytes. Export damaged bytes, create a new store only after confirmation, import a valid store, cancel a second import, and assert the active document remains valid.

- [ ] **Step 6: Add security journeys**

Assert `window.process`, `window.require`, raw `ipcRenderer`, and filesystem APIs are undefined; `window.kopper` contains only documented methods; navigation to `https://example.com` is prevented; `window.open` cannot create remote content; CSP blocks inline script execution; and a malformed IPC-like object passed to a bridge method returns `validation_failed`.

- [ ] **Step 7: Run end-to-end tests repeatedly**

Run:

```bash
pnpm build
pnpm test:e2e --repeat-each=3
```

Expected: all tests pass three consecutive times without leaked Electron processes or temporary data directories.

- [ ] **Step 8: Commit end-to-end coverage**

```bash
git add tests/e2e playwright.config.ts src/main/index.ts
 git commit -m "test: cover Kopper Electron workflows"
```

## Task 3: Add Static Security and Privacy Regression Tests

**Files:**

- Create: `src/main/security/securityPolicy.test.ts`
- Create: `src/main/security/securityPolicy.ts`
- Modify: `src/main/window/windowManager.ts`
- Modify: `src/main/index.ts`

**Interfaces:**

- Consumes: BrowserWindow creation and session web-request/navigation hooks.
- Produces: `installSecurityPolicy(session, windows): () => void` and tests preventing accidental network or renderer privilege regressions.

- [ ] **Step 1: Write failing security-policy tests**

Assert:

- navigation permits only the packaged renderer URL or electron-vite dev URL in development
- `setWindowOpenHandler` denies every new window and opens no external URL automatically
- permissions other than accessibility handled in the main process are denied
- production requests to `http:`, `https:`, `ws:`, and `wss:` are cancelled
- local `file:`, `devtools:` in development, and renderer assets remain allowed
- application logs redact note bodies, clipboard values, and imported file contents

- [ ] **Step 2: Implement and install the security policy**

Use `webContents.on("will-navigate")`, `setWindowOpenHandler`, `session.setPermissionRequestHandler`, and `session.webRequest.onBeforeRequest`. Development allowances must be gated by `!app.isPackaged`, not an arbitrary environment variable.

- [ ] **Step 3: Add dependency and source scans**

Add scripts:

```json
{
  "audit:deps": "pnpm audit --prod --audit-level high",
  "audit:source": "node scripts/verify-package.mjs --source"
}
```

Source mode fails on imports of `electron-updater`, analytics SDK names, unrestricted `shell.openExternal`, `webSecurity: false`, `nodeIntegration: true`, or `contextIsolation: false` outside negative test fixtures.

- [ ] **Step 4: Run security verification**

Run:

```bash
pnpm vitest run src/main/security tests/e2e/security.spec.ts
pnpm audit:deps
pnpm audit:source
```

Expected: all commands exit 0. If the package audit reports a high-severity production issue, update or replace the dependency rather than suppressing it.

- [ ] **Step 5: Commit security policy**

```bash
git add src/main/security src/main/window src/main/index.ts scripts/verify-package.mjs package.json pnpm-lock.yaml
 git commit -m "security: enforce local-only Electron runtime"
```

## Task 4: Add Continuous Integration and Credentialed Release Automation

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Modify: `README.md`

**Interfaces:**

- Consumes: pnpm scripts, Git tags, and GitHub environment secrets.
- Produces: required CI checks and a tag-driven GitHub Release containing the notarized universal DMG and checksums.

- [ ] **Step 1: Add the CI workflow**

On pull request and pushes to `main`, use `macos-14`, Node 24, Corepack, and `pnpm install --frozen-lockfile`. Run in separate named steps:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
pnpm audit:deps
pnpm audit:source
pnpm package:unsigned
```

Upload Playwright traces and the unsigned application only when a relevant step fails. Set a 30-minute job timeout and least-privilege `contents: read` permissions.

- [ ] **Step 2: Add the release workflow**

Trigger only on tags matching `v*`. Use a protected `release` environment with secrets named:

- `APPLE_API_KEY_P8` containing the p8 file contents
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
- `CSC_LINK` containing the Developer ID Application certificate
- `CSC_KEY_PASSWORD`

Write the p8 value to `$RUNNER_TEMP/AuthKey_${APPLE_API_KEY_ID}.p8`, export `APPLE_API_KEY` to that path, run `pnpm package:release`, generate SHA-256 checksums, and upload only the notarized DMG and checksum file to the GitHub Release. Delete temporary key material in an `always()` cleanup step.

- [ ] **Step 3: Document development and release commands**

`README.md` must explain macOS 14 requirement, local-only storage path, Accessibility purpose, `pnpm dev`, tests, unsigned packaging, required release secrets by name, tag/version equality, and the absence of accounts, telemetry, sync, and automatic updates. Do not include secret examples or real team identifiers.

- [ ] **Step 4: Validate workflow syntax and local commands**

Run:

```bash
brew install actionlint
actionlint .github/workflows/*.yml
pnpm test
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Commit CI and release automation**

```bash
git add .github README.md
 git commit -m "ci: automate Kopper verification and release"
```

## Task 5: Execute and Record Physical macOS Acceptance

**Files:**

- Create: `tests/manual/macos-capture.md`
- Create: `docs/releases/acceptance-template.md`
- Create for the first release: `docs/releases/v0.1.0-acceptance.md`

**Interfaces:**

- Consumes: notarized DMG from the release workflow and a clean macOS 14 or newer machine.
- Produces: a committed release-specific evidence record with command output, application matrix, clipboard cases, and residual risks.

- [ ] **Step 1: Write the manual acceptance procedure**

The procedure must require:

1. Verify `shasum -a 256` against the published checksum.
2. Install from DMG on a clean account.
3. Run `spctl --assess --type execute --verbose=4 /Applications/Kopper.app`.
4. Run `codesign --verify --deep --strict --verbose=4 /Applications/Kopper.app`.
5. Run `xcrun stapler validate /Applications/Kopper.app`.
6. Complete Accessibility onboarding.
7. Capture exact selected text in Chrome, ChatGPT, Claude, Cursor, TextEdit, and one additional native text application.
8. Repeat with plain text, rich text, image-plus-text clipboard, empty selection, unchanged text equal to prior clipboard text, secure input, revoked permission, source closure, and rapid repeated double-Shift.
9. Verify focus remains in the source app and the supported clipboard representations are restored.
10. Exercise every note, section, completed, import/export, shortcut, window, and theme acceptance item from the spec.
11. Quit and confirm no Kopper or helper process remains with `pgrep -ifl Kopper`.
12. Remove the app and confirm no launch agent or login item remains.

- [ ] **Step 2: Create the evidence template**

The template contains package version, commit SHA, macOS version, machine architecture, artifact checksum, signing/notarization command output, each application/result row, each clipboard/result row, all automated command summaries, observed failures, retest evidence, and residual risks. Use `Not run`, `Pass`, or `Fail` values rather than empty cells.

- [ ] **Step 3: Run the complete automated release gate**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
pnpm audit:deps
pnpm audit:source
pnpm package:release
```

Expected: all commands exit 0 and produce a signed, notarized universal DMG.

- [ ] **Step 4: Perform the physical-mac procedure and fill the release evidence**

For the first release, copy the template to `docs/releases/v0.1.0-acceptance.md`, replace every `Not run` with Pass or Fail, paste bounded command output, and record any retest after a failure. Later releases use the same `v<package-version>-acceptance.md` naming rule. Do not publish a release while any required row is Fail.

- [ ] **Step 5: Commit acceptance evidence**

```bash
git add tests/manual/macos-capture.md docs/releases
 git commit -m "docs: record Kopper release acceptance"
```

## Milestone Acceptance

A release is complete only when CI is green, dependency and source audits pass, the DMG is universal and notarized, Gatekeeper accepts the installed app, all physical capture targets pass without focus or supported clipboard loss, every spec workflow passes, and quitting or uninstalling leaves no background process.
