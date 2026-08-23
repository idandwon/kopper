# Kopper Unsigned Friends Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a checksum-verified, unsigned universal Kopper DMG that friends can install from `idandwon/kopper` with the existing one-line curl command and approve once through macOS Open Anyway when required.

**Architecture:** Keep the existing fixed-origin, transactional installer and GitHub immutable-release controls, but replace Apple trust checks with strict product-identity checks and make first launch best-effort after transaction commit. The tag workflow builds an explicitly unsigned/unnotarized universal DMG and creates an exact three-asset draft; a separate manually approved workflow revalidates and immutably publishes that draft.

**Tech Stack:** Bash, Electron 38, electron-builder, Node.js 24, TypeScript, Vitest, Playwright, GitHub Actions, GitHub CLI.

**Spec:** `docs/superpowers/specs/2026-08-23-kopper-unsigned-friends-release-design.md`

## Global Constraints

- Distribution is an unsigned friends beta for macOS 14 Sonoma or newer, not an Apple-notarized production release.
- Do not require Apple Developer enrollment, Developer ID, Team ID, Apple API credentials, signing certificates, notarization, Homebrew, Node.js, `sudo`, `xattr`, or Gatekeeper disablement.
- Never remove quarantine, modify Gatekeeper, or present a shell command that bypasses macOS security policy.
- Keep the public source fixed at `https://github.com/idandwon/kopper` and the canonical install command fixed at `curl -fsSL https://github.com/idandwon/kopper/releases/latest/download/install.sh | bash`.
- Install only to `~/Applications/Kopper.app`; preserve all data outside that application bundle.
- Accept only exact `v<major>.<minor>.<patch>` tags, bundle identifier `com.kopper.app`, and a bundle version equal to the release version.
- Each release has exactly `Kopper-<version>-universal.dmg`, `Kopper-<version>-universal.dmg.sha256`, and `install.sh`.
- Keep draft-first publication, byte-for-byte tagged installer comparison, SHA-256 validation, and post-publication `isImmutable: true` enforcement.
- Preserve transactional upgrade rollback through installed-bundle verification and cleanup; commit before attempting first launch.
- `open` is best-effort after commit: its failure must leave the new app installed, clean bounded artifacts, print Open Anyway guidance, and return success.
- Preserve the existing 91-row signed-release traceability record as historical evidence; do not relabel unrun signing or notarization checks as passed.
- Do not publish an immutable release without a fresh explicit user approval after the draft and physical unsigned-beta evidence have been inspected.

---

## File Map

### Installer behavior

- Modify `install.sh`: remove Apple trust prerequisites and assessments, retain identity/transaction checks, commit before best-effort launch, and print honest unsigned-beta guidance.
- Modify `scripts/install.test.ts`: model unsigned installation, prove Apple tools are neither required nor invoked, and lock the post-commit launch-failure behavior.

### Packaging and workflows

- Modify `package.json`: replace the credentialed `package:release` entry with the self-contained `package:beta` unsigned universal-DMG command.
- Delete `scripts/release.mjs`: remove the uncalled Apple-credentialed release orchestrator.
- Delete `scripts/release.test.ts`: remove tests for the deleted credentialed orchestrator.
- Modify `.github/workflows/release.yml`: run all release gates, build and verify the unsigned DMG, and create an exact three-asset draft without Apple secrets.
- Modify `.github/workflows/promote-release.yml`: retain exact candidate verification and immutable publication while removing the incompatible signed-evidence gate.
- Modify `scripts/workflows.test.ts`: assert unsigned build flags, absent Apple credentials, exact assets, draft-first behavior, and immutable promotion.

### User and release documentation

- Modify `README.md`: describe the unsigned friends beta, one-time Open Anyway flow, checksum boundary, no-secret release process, and exact tag workflow.
- Modify `tests/manual/macos-installer.md`: turn the physical procedure into the focused unsigned-beta acceptance gate and remove impossible signature/notarization expectations.
- Modify `docs/releases/installer-acceptance-template.md`: record exact unsigned-beta artifact, installer, first-launch, cleanup, upgrade, and data-preservation evidence.
- Modify `docs/releases/v0.1.0-acceptance.md`: preserve all historical rows verbatim while replacing only the forward-looking next-action section with a pointer to the superseding unsigned-beta procedure.

### Planning evidence

- Create `.superpowers/sdd/2026-08-23-kopper-unsigned-friends-release/implementation-report.md`: record task commits, RED/GREEN evidence, full verification, draft run, physical acceptance, and publication decision without overstating unrun work.

---

### Task 1: Convert the Installer to Unsigned Product-Identity Verification

**Files:**
- Modify: `scripts/install.test.ts`
- Modify: `install.sh`

**Interfaces:**
- Consumes: public release assets named from the resolved strict semantic version.
- Produces: an installer that validates checksum plus bundle identity, commits before launch, and returns zero when only `open` fails.

- [ ] **Step 1: Replace Apple-trust fixture states with unsigned identity and launch states**

In `scripts/install.test.ts`, remove `dmg-gatekeeper`, `installed-codesign`, `mounted-codesign`, `mounted-publisher`, and `staged-gatekeeper` from `InstallerFailure`. Keep `launch`, checksum, cleanup, move, and signal states. Stop creating `codesign` and `spctl` shims in the command list so their accidental invocation fails through the hermetic `PATH`:

```ts
const commands = [
  "curl",
  "ditto",
  "hdiutil",
  "id",
  "mktemp",
  "mv",
  "open",
  "pgrep",
  "plutil",
  "rm",
  "shasum",
  "sw_vers",
  "uname",
];
```

Remove the shim branches and markers dedicated only to `codesign` and `spctl`. Retarget the staged-install signal fixture from `codesign-staged` to the second staged `plutil` lookup so the existing transaction test still injects a signal before replacement:

```ts
} else if (command === "plutil") {
  if (
    configuration.failure === "signal" &&
    last.includes(".install.") &&
    args.includes("CFBundleShortVersionString")
  ) {
    process.kill(process.ppid, "SIGTERM");
    process.exit(1);
  }
  if (args.includes("CFBundleIdentifier")) {
    process.stdout.write(configuration.bundleIdentifier + "\n");
  } else if (args.includes("CFBundleShortVersionString")) {
    process.stdout.write(configuration.bundleVersion + "\n");
  } else {
    process.exit(1);
  }
```

- [ ] **Step 2: Write the failing unsigned installer tests**

Change the happy-path expected call order so it contains checksum, mount, two `plutil` checks at each app stage, replacement, cleanup, and open, with no Apple trust markers. Add these explicit assertions:

```ts
expect(fixture.calls().map(({ command }) => command)).not.toContain("codesign");
expect(fixture.calls().map(({ command }) => command)).not.toContain("spctl");
expect(result.stdout).toContain("Verifying Kopper download and application identity...");
expect(result.stdout).toContain("Kopper installed at");
expect(result.stdout).toContain("System Settings → Privacy & Security → Open Anyway");
```

Replace both existing `Kopper installed successfully.` assertions with `Kopper installed at`.

Replace the old publisher/signature rejection table with identity failures that remain meaningful for an unsigned app:

```ts
it.each([
  ["a non-directory app", { mountedAppType: "file" as const }],
  ["a symlink app", { mountedAppType: "symlink" as const }],
  ["a wrong bundle identifier", { bundleIdentifier: "com.attacker.app" }],
  ["a wrong bundle version", { bundleVersion: "9.9.9" }],
  ["multiple root applications", { mountedApps: ["Kopper.app", "Other.app"] }],
])("rejects %s before replacing an existing app", (_description, options) => {
  const fixture = createInstallerFixture({ existingApp: "old", ...options });
  const result = fixture.run();
  expect(result.status).toBe(1);
  expect(fixture.installedMarker()).toBe("old");
  expect(fixture.store()).toContain('"notes":[]');
  expect(fixture.temporaryArtifacts()).toEqual([]);
});
```

Split `launch` out of the rollback-failure table and add the new committed behavior:

```ts
it("keeps a verified upgrade when macOS blocks the best-effort first launch", () => {
  const fixture = createInstallerFixture({ existingApp: "old", failure: "launch" });
  const result = fixture.run();
  expect(result.status).toBe(0);
  expect(fixture.installedMarker()).toBe("new-v0.1.0");
  expect(fixture.store()).toContain('"notes":[]');
  expect(fixture.temporaryArtifacts()).toEqual([]);
  expect(result.stdout).toContain("Kopper installed at");
  expect(result.stdout).toContain("System Settings → Privacy & Security → Open Anyway");
  expect(result.stderr).toContain("could not be opened automatically");
});
```

- [ ] **Step 3: Run focused tests and confirm the RED failures are contractual**

Run:

```bash
pnpm exec vitest run scripts/install.test.ts
```

Expected: FAIL because `install.sh` still requires and invokes `codesign`/`spctl`, uses the Apple-signature message, and rolls back with status 1 when `open` fails. Identity, checksum, and transaction tests unrelated to the trust-model change should remain green.

- [ ] **Step 4: Remove Apple trust checks while preserving product identity**

In `install.sh`, change the required-command loop to:

```bash
for command_name in curl hdiutil shasum plutil ditto open pgrep mktemp sw_vers; do
  require_command "$command_name"
done
```

Rename `verify_app` to `verify_app_identity`, keep its directory, symlink, bundle identifier, and bundle version checks, and end after the version comparison:

```bash
verify_app_identity() {
  local app_path="$1"
  local bundle_identifier=""
  local bundle_version=""

  [[ -d "$app_path" && ! -L "$app_path" ]] || return 1
  bundle_identifier="$(
    plutil -extract CFBundleIdentifier raw -o - "${app_path}/Contents/Info.plist"
  )" || return 1
  [[ "$bundle_identifier" == "$KOPPER_BUNDLE_IDENTIFIER" ]] || return 1
  bundle_version="$(
    plutil -extract CFBundleShortVersionString raw -o - "${app_path}/Contents/Info.plist"
  )" || return 1
  [[ "$bundle_version" == "$version" ]]
}
```

Replace every `verify_app` call with `verify_app_identity`. Change the verification progress text and delete the DMG `spctl` block:

```bash
printf 'Verifying Kopper download and application identity...\n'
```

- [ ] **Step 5: Commit the transaction before best-effort launch**

After final installed identity verification and successful `cleanup_downloads`, mark the transaction committed inside the existing signal-safe update boundary, then remove the rollback backup. Only after those operations attempt to open:

```bash
verify_app_identity "$KOPPER_TARGET" \
  || fail "The installed Kopper application failed identity verification."
cleanup_downloads || fail "Could not clean up the Kopper disk image."

begin_transaction_update
transaction_phase="committed"
finish_transaction_update

if ! open "$KOPPER_TARGET"; then
  printf 'Kopper installer: Kopper was installed but could not be opened automatically.\n' >&2
fi

if [[ -n "$rollback_target" && -e "$rollback_target" ]]; then
  begin_transaction_update
  if rm -rf "$rollback_target"; then
    rollback_target=""
  else
    finish_transaction_update
    fail "Kopper was installed, but the previous application backup could not be removed."
  fi
  finish_transaction_update
fi

printf 'Kopper installed at %s.\n' "$KOPPER_TARGET"
printf 'Kopper is an unsigned friends beta. If macOS blocks the first launch, open System Settings → Privacy & Security and choose Open Anyway for Kopper.\n'
```

Do not add an `xattr`, `spctl`, or quarantine-removal fallback.

- [ ] **Step 6: Run installer tests and syntax validation**

Run:

```bash
pnpm exec vitest run scripts/install.test.ts
pnpm verify:installer
```

Expected: installer tests PASS and `bash -n install.sh` exits 0. Inspect the call log assertion to confirm neither Apple trust tool appears.

- [ ] **Step 7: Commit the installer change**

```bash
git add install.sh scripts/install.test.ts
git commit -m "feat: install unsigned Kopper beta safely"
```

---

### Task 2: Replace the Credentialed Release Runner with an Unsigned Draft Workflow

**Files:**
- Modify: `scripts/workflows.test.ts`
- Modify: `.github/workflows/release.yml`
- Modify: `package.json`
- Delete: `scripts/release.mjs`
- Delete: `scripts/release.test.ts`

**Interfaces:**
- Consumes: package version, exact pushed `v<version>` tag, `package:beta`, and `verify:package <app-path>`.
- Produces: an inspected draft containing only the versioned universal DMG, its SHA-256 file, and tagged `install.sh`.

- [ ] **Step 1: Replace credential-scoping tests with unsigned-workflow tests**

In `scripts/workflows.test.ts`, remove `secretNames()` and the two tests that expect Apple credential setup/scoping. Parse the package scripts next to the existing workflow fixtures:

```ts
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts: Record<string, string> };
```

Add:

```ts
it("builds the release without Apple credentials, signing, or notarization", () => {
  expect(release).not.toMatch(/secrets\.|APPLE_|CSC_|notarytool|stapler/u);
  const build = step(release, "Build unsigned universal DMG");
  expect(build).toContain("run: pnpm package:beta");
  expect(packageJson.scripts["package:beta"]).toContain("--mac dmg --universal");
  expect(packageJson.scripts["package:beta"]).toContain("-c.mac.identity=null");
  expect(packageJson.scripts["package:beta"]).toContain("-c.mac.notarize=false");
});

it("validates tag/version equality before release gates", () => {
  const version = step(release, "Verify exact tag version");
  expect(version).toContain('test "$GITHUB_REF_NAME" = "v${package_version}"');
  expect(release.indexOf(version)).toBeLessThan(
    release.indexOf(step(release, "Run tests")),
  );
});

it("runs every unsigned release gate before packaging", () => {
  const names = [
    "Run tests",
    "Run typecheck",
    "Build application",
    "Run Electron end-to-end tests",
    "Audit production dependencies",
    "Audit application source",
  ];
  const packageStep = step(release, "Build unsigned universal DMG");
  for (const name of names) {
    expect(release.indexOf(step(release, name))).toBeLessThan(
      release.indexOf(packageStep),
    );
  }
});

it("verifies unsigned package metadata before draft creation", () => {
  const verify = step(release, "Verify unsigned package");
  expect(verify).toContain(
    'pnpm verify:package "release/mac-universal/Kopper.app"',
  );
  expect(release.indexOf(verify)).toBeLessThan(
    release.indexOf(step(release, "Create draft GitHub Release")),
  );
});
```

Keep the exact-asset, draft-only, tagged-installer, action-pin, and immutable-promotion tests.

- [ ] **Step 2: Run the workflow test and confirm RED**

Run:

```bash
pnpm exec vitest run scripts/workflows.test.ts
```

Expected: FAIL because the workflow still references Apple secrets and the named unsigned build, tag-version, gate, and package-verification steps do not exist.

- [ ] **Step 3: Define the self-contained unsigned DMG command and remove the dead credentialed runner**

In `package.json`, remove `package:release` and add:

```json
"package:beta": "pnpm build && electron-builder --mac dmg --universal -c.mac.identity=null -c.mac.notarize=false"
```

Keep `package:unsigned` as the local directory-app command and keep `package:dir` pointing to it. Delete `scripts/release.mjs` and `scripts/release.test.ts`. Confirm there are no remaining callers:

```bash
rg -n "package:release|scripts/release\.mjs|APPLE_API_|CSC_|notarytool|stapler" \
  package.json scripts .github README.md docs tests
```

Expected at this step: hits may remain only in historical evidence documents that will be addressed in Task 4; active package scripts and source have no credentialed release runner.

- [ ] **Step 4: Rewrite the tag workflow as an unsigned draft builder**

In `.github/workflows/release.yml`, retain the exact tag trigger, `contents: write`, pinned checkout/setup-node actions, locked install, draft creation, and `environment: release`. Rename the job to `Build unsigned friends beta`. Replace all Apple-key and signed-package steps with these ordered steps:

```yaml
      - name: Verify exact tag version
        run: |
          package_version="$(node -p "require('./package.json').version")"
          test "$GITHUB_REF_NAME" = "v${package_version}"
          test "$(git describe --tags --exact-match HEAD)" = "$GITHUB_REF_NAME"

      - name: Run tests
        run: pnpm test

      - name: Run typecheck
        run: pnpm typecheck

      - name: Build application
        run: pnpm build

      - name: Run Electron end-to-end tests
        run: env -u ELECTRON_RUN_AS_NODE pnpm test:e2e

      - name: Audit production dependencies
        run: pnpm audit:deps

      - name: Audit application source
        run: pnpm audit:source

      - name: Build unsigned universal DMG
        run: pnpm package:beta

      - name: Verify unsigned package
        run: pnpm verify:package "release/mac-universal/Kopper.app"
```

The tested `package:beta` script carries the explicit identity and notarization overrides. Leave `Generate exact release assets` and `Create draft GitHub Release` after package verification. Do not add Apple environment variables or secret reads.

- [ ] **Step 5: Tighten exact three-asset workflow assertions**

Extend the existing draft test to extract every quoted asset argument from the `gh release create` command and assert the required variables appear exactly once:

```ts
const createRelease = step(release, "Create draft GitHub Release");
expect(createRelease).toContain('gh release create "$GITHUB_REF_NAME"');
expect(createRelease.match(/"\$DMG_PATH"/gu)).toHaveLength(1);
expect(createRelease.match(/"\$CHECKSUM_PATH"/gu)).toHaveLength(1);
expect(createRelease.match(/"\$INSTALLER_PATH"/gu)).toHaveLength(1);
expect(createRelease).toContain("--draft");
```

- [ ] **Step 6: Run focused workflow and package-source checks**

Run:

```bash
pnpm exec vitest run scripts/workflows.test.ts
pnpm typecheck
pnpm verify:installer
```

Expected: all commands exit 0. `scripts/workflows.test.ts` proves no active release workflow references Apple secrets and the build explicitly disables signing and notarization.

- [ ] **Step 7: Commit the unsigned release workflow**

```bash
git add package.json .github/workflows/release.yml scripts/workflows.test.ts
git rm scripts/release.mjs scripts/release.test.ts
git commit -m "feat: build unsigned friends beta drafts"
```

---

### Task 3: Decouple Promotion from Historical Signed-Release Evidence

**Files:**
- Modify: `scripts/workflows.test.ts`
- Modify: `.github/workflows/promote-release.yml`

**Interfaces:**
- Consumes: an exact draft release with the three required assets and tagged source checkout.
- Produces: manual immutable publication that validates the artifact, checksum, and installer but does not claim Apple-signing evidence.

- [ ] **Step 1: Write the failing unsigned promotion contract**

Replace the test named `promotes only after exact-tag final evidence validation` with:

```ts
it("publishes only an exact inspected unsigned draft", () => {
  expect(promote).toContain("workflow_dispatch:");
  expect(promote).toContain("environment: release");
  expect(promote).toContain("permissions:\n  contents: write");
  const checkout = step(promote, "Check out exact release tag");
  const inspect = step(promote, "Inspect draft and verify exact candidate assets");
  const publish = step(promote, "Publish inspected unsigned draft");
  expect(checkout).toContain("ref: ${{ inputs.tag }}");
  expect(checkout).toContain("persist-credentials: false");
  expect(promote).not.toContain("--final");
  expect(promote).not.toContain("Validate final release evidence");
  expect(promote.indexOf(inspect)).toBeLessThan(promote.indexOf(publish));
  expect(publish).toContain('gh release edit "$TAG" --draft=false');
});
```

Add direct assertions that the inspection step replaces the draft/exact-assets checks previously supplied by the signed-evidence validator:

```ts
const inspect = step(promote, "Inspect draft and verify exact candidate assets");
expect(inspect).toContain("release.isDraft !== true");
expect(inspect).toContain(
  "JSON.stringify(assetNames) !== JSON.stringify(expectedAssets)",
);
```

Retain the exact candidate metadata test, installer `cmp`, checksum syntax and verification, and post-publish immutable-state assertions. In those retained tests, replace every `Publish validated draft release` step lookup with `Publish inspected unsigned draft`.

- [ ] **Step 2: Run the focused workflow test and confirm RED**

Run:

```bash
pnpm exec vitest run scripts/workflows.test.ts
```

Expected: FAIL because promotion still contains the signed 91-row `--final` validator and the publish step has the old name.

- [ ] **Step 3: Remove only the incompatible signed-evidence gate**

In `.github/workflows/promote-release.yml`:

- Rename the job to `Inspect and publish unsigned draft`.
- Delete the entire `Validate final release evidence` step.
- Rename `Publish validated draft release` to `Publish inspected unsigned draft`.
- In `Inspect draft and verify exact candidate assets`, immediately after `gh release view`, add an exact draft-and-assets check that does not depend on the historical validator:

```yaml
          node - "$release_json" "$TAG" "$ARTIFACT" "$CHECKSUM" "$INSTALLER" <<'NODE'
          const { readFileSync } = require("node:fs");
          const [releasePath, expectedTag, ...expectedAssets] = process.argv.slice(2);
          const release = JSON.parse(readFileSync(releasePath, "utf8"));
          const assetNames = release.assets.map(({ name }) => name).sort();
          expectedAssets.sort();
          if (
            release.tagName !== expectedTag ||
            release.isDraft !== true ||
            JSON.stringify(assetNames) !== JSON.stringify(expectedAssets)
          ) {
            throw new Error("Draft release metadata or exact asset set did not match.");
          }
          NODE
```

- Remove the now-unused `id: release`, `artifact_sha256`, and `release_json` output block from the inspection step.
- Keep `Verify exact tag version and commit`, exact asset download/counting, installer syntax and `cmp`, checksum-line validation, SHA-256 check, publication, and `isImmutable: true` verification unchanged.

Do not change `scripts/validate-release-doc-traceability.mjs`; CI must continue validating the historical 91-row record in nonfinal mode.

- [ ] **Step 4: Run promotion tests and static workflow validation**

Run:

```bash
pnpm exec vitest run scripts/workflows.test.ts
pnpm validate:release-docs
pnpm exec actionlint .github/workflows/release.yml .github/workflows/promote-release.yml
```

Expected: workflow tests PASS, historical release-document validation reports 91 validated rows, and actionlint exits 0.

- [ ] **Step 5: Commit the promotion change**

```bash
git add .github/workflows/promote-release.yml scripts/workflows.test.ts
git commit -m "fix: promote inspected unsigned release drafts"
```

---

### Task 4: Replace Active Release Documentation with Honest Unsigned-Beta Guidance

**Files:**
- Modify: `README.md`
- Modify: `tests/manual/macos-installer.md`
- Modify: `docs/releases/installer-acceptance-template.md`
- Modify: `docs/releases/v0.1.0-acceptance.md`

**Interfaces:**
- Consumes: installer behavior from Task 1 and draft/promotion behavior from Tasks 2–3.
- Produces: copyable install instructions and a focused physical acceptance record that distinguish repository integrity from Apple trust.

- [ ] **Step 1: Rewrite the README install section**

Replace the active install copy with:

````markdown
## Install

Kopper is currently an **unsigned friends beta** for macOS 14 Sonoma or newer. Install the latest release with:

```bash
curl -fsSL https://github.com/idandwon/kopper/releases/latest/download/install.sh | bash
```

The installer verifies the immutable GitHub Release checksum and Kopper's bundle identity, then installs to `~/Applications/Kopper.app`. Apple has not signed or notarized this beta, so macOS may block the first launch. If it does, open **System Settings → Privacy & Security**, find Kopper, and choose **Open Anyway** once.

No `sudo`, `xattr`, Gatekeeper disablement, Node.js, or Homebrew is needed. The SHA-256 check protects the download against corruption or replacement within the immutable release; it does not make the app Apple-verified.
````

Keep the existing upgrade, uninstall, local-data, privacy, and Accessibility paragraphs after this copy.

- [ ] **Step 2: Rewrite the README release section**

Remove the Apple secret list and `package:release` instructions. Document:

```markdown
## Releases

Unsigned friends-beta releases use the protected GitHub `release` environment but require no repository or environment secrets. The package version and pushed tag must match exactly: version `<version>` requires tag `v<version>`.

The tag-triggered **Release** workflow runs the complete test, type, build, E2E, dependency-audit, and source-audit gates; explicitly disables signing and notarization; verifies the universal application package; and creates a draft containing exactly the DMG, SHA-256 file, and tagged `install.sh`.

Inspect and physically test that draft with `tests/manual/macos-installer.md`. Only after that evidence is complete should an authorized reviewer approve and run **Promote Release** for the exact tag. Publication is irreversible for that tag because immutable releases are enabled; a failed published candidate requires a new version and tag.
```

Retain the exact safe tag commands and the immutable-release prerequisite.

- [ ] **Step 3: Convert the manual installer procedure to unsigned acceptance**

In `tests/manual/macos-installer.md`:

- Change the title to `Unsigned friends-beta macOS installer acceptance procedure`.
- Make UNSIGNED-01 through UNSIGNED-03 a pre-promotion draft test. Download the exact draft assets with `gh release download v0.1.0`, verify the checksum, mount the downloaded DMG read-only, inspect the bundle, copy it with `ditto` to `~/Applications/Kopper.app`, and exercise first launch through Finder. Do not run the draft `install.sh`: its intentionally fixed `releases/latest` origin cannot address a draft release.
- Make UNSIGNED-04 through UNSIGNED-06 post-publication tests of the canonical curl installer on a second clean account. This is the first point at which `releases/latest` can resolve the immutable release.
- Remove `codesign`, `spctl`, stapler, notarization, and “without an override” pass criteria.
- Require the one-time **System Settings → Privacy & Security → Open Anyway** path when macOS blocks launch; prohibit `xattr`, Gatekeeper disablement, `sudo`, and quarantine removal.
- Preserve structured DMG cleanup, staging/rollback cleanup, running-process refusal, repeated install, inert store hash, and bounded evidence rules.

Include this exact pre-promotion draft procedure, using a clean account with no previous Kopper app:

```bash
TAG="v0.1.0"
VERSION="${TAG#v}"
ASSET_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/kopper-draft.XXXXXX")"
MOUNT_POINT="$(mktemp -d "${TMPDIR:-/tmp}/kopper-mount.XXXXXX")"
STORE="$HOME/Library/Application Support/Kopper/kopper.json"
TARGET="$HOME/Applications/Kopper.app"

gh release download "$TAG" --repo idandwon/kopper --dir "$ASSET_DIRECTORY"
test "$(find "$ASSET_DIRECTORY" -maxdepth 1 -type f | wc -l | tr -d ' ')" = "3"
test -f "$ASSET_DIRECTORY/Kopper-${VERSION}-universal.dmg"
test -f "$ASSET_DIRECTORY/Kopper-${VERSION}-universal.dmg.sha256"
test -f "$ASSET_DIRECTORY/install.sh"
bash -n "$ASSET_DIRECTORY/install.sh"
(cd "$ASSET_DIRECTORY" && shasum -a 256 -c "Kopper-${VERSION}-universal.dmg.sha256")

mkdir -p "$(dirname "$STORE")" "$HOME/Applications"
printf '%s\n' '{"schemaVersion":1,"notes":[]}' > "$STORE"
STORE_BEFORE="$(shasum -a 256 "$STORE" | awk '{print $1}')"
test ! -e "$TARGET"
hdiutil attach -readonly -nobrowse -mountpoint "$MOUNT_POINT" \
  "$ASSET_DIRECTORY/Kopper-${VERSION}-universal.dmg"
APP="$MOUNT_POINT/Kopper.app"
test -d "$APP"
test ! -L "$APP"
test "$(find "$MOUNT_POINT" -maxdepth 1 -type d -name '*.app' | wc -l | tr -d ' ')" = "1"
test "$(plutil -extract CFBundleIdentifier raw -o - "$APP/Contents/Info.plist")" = "com.kopper.app"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = "$VERSION"
test "$(plutil -extract LSMinimumSystemVersion raw -o - "$APP/Contents/Info.plist")" = "14.0"
lipo -archs "$APP/Contents/MacOS/Kopper"
lipo -archs "$APP/Contents/Resources/app.asar.unpacked/node_modules/uiohook-napi/build/Release/uiohook_napi.node"
ditto "$APP" "$TARGET"
hdiutil detach "$MOUNT_POINT"
test ! -e "$MOUNT_POINT" || rmdir "$MOUNT_POINT"
test "$(shasum -a 256 "$STORE" | awk '{print $1}')" = "$STORE_BEFORE"
open "$TARGET" || true
```

Require both `lipo` outputs to contain exactly `arm64` and `x86_64`. Record whether launch was direct or required the documented Open Anyway action. After evidence capture, remove only the exact `ASSET_DIRECTORY` and clean-account `TARGET`; never remove the store unless the tester created it solely as the inert fixture and records that cleanup.

Use these focused rows:

```markdown
| ID | Required observation |
| UNSIGNED-01 | The exact draft contains only the versioned universal DMG, its matching SHA-256 file, and the tagged `install.sh`; checksum verification succeeds. |
| UNSIGNED-02 | The root-level real `Kopper.app` reports the exact version, bundle identifier `com.kopper.app`, minimum macOS `14.0`, and both `arm64` and `x86_64` runtime architectures. |
| UNSIGNED-03 | A manual draft installation to `~/Applications/Kopper.app` preserves the inert `kopper.json` hash and first launch either opens directly or succeeds after one System Settings → Privacy & Security → Open Anyway approval; no shell security bypass is used. |
| UNSIGNED-04 | After publication, the canonical installer leaves exactly `~/Applications/Kopper.app`, no mounted Kopper DMG, and no `.Kopper.app.install.*` or `.Kopper.app.rollback.*` artifact. |
| UNSIGNED-05 | After publication, running-process refusal and a subsequent quit-and-upgrade preserve the app transaction and the inert `kopper.json` SHA-256. |
| UNSIGNED-06 | After immutable publication, the canonical curl command exits 0 on a second clean macOS 14+ standard account and prints the unsigned-beta approval guidance. |
```

- [ ] **Step 4: Update the acceptance template without falsifying old evidence**

In `docs/releases/installer-acceptance-template.md`, change the title and status scope to unsigned friends-beta acceptance, replace INST rows with UNSIGNED-01 through UNSIGNED-06 above, and add fields for:

```markdown
| Draft release URL/run ID | Not run — `<draft URL and workflow run URL>` |
| Exact three asset names | Not run |
| DMG SHA-256 | Not run — `<64 lowercase hexadecimal characters>` |
| First-launch result | Not run — `direct` or `Open Anyway` |
| Security bypass used | Not run — must be `No` |
| Published release immutable | Not run — exact tag must report `isImmutable: true` after promotion |
```

State that UNSIGNED-01 through UNSIGNED-03 are pre-promotion evidence and UNSIGNED-04 through UNSIGNED-06 are required post-publication installer checks. State that the template is not evidence until copied to a versioned record and filled with bounded observations.

- [ ] **Step 5: Preserve v0.1.0 history and mark the superseding decision**

Do not alter the existing status tables, commands, required-next-actions section, or final decision in `docs/releases/v0.1.0-acceptance.md`. Append this new section after the historical final-decision table:

```markdown
## Superseding release decision — 2026-08-23

The signed/notarized v0.1.0 path above remains historical evidence and was not completed. The repository owner subsequently approved an explicitly unsigned friends beta under `docs/superpowers/specs/2026-08-23-kopper-unsigned-friends-release-design.md`.

Before publication, create a fresh versioned record from `docs/releases/installer-acceptance-template.md`, run UNSIGNED-01 through UNSIGNED-03 against the exact draft, and record the release workflow URL, tag, commit, three assets, checksum, and physical-Mac observations. After explicit publication approval, run UNSIGNED-04 through UNSIGNED-06 on a second clean account and append the immutable release result.
```

- [ ] **Step 6: Run documentation and active-path safety checks**

Run:

```bash
pnpm validate:release-docs
rg -n "APPLE_API_|CSC_|package:release|signed and notarized release|Gatekeeper disable|xattr" \
  README.md install.sh package.json .github tests/manual/macos-installer.md \
  docs/releases/installer-acceptance-template.md
git diff --check
```

Expected: traceability reports 91 validated historical rows; active files contain no Apple credential or credentialed-release instructions; Gatekeeper/xattr matches are prohibitions only; diff check is clean.

- [ ] **Step 7: Commit the documentation change**

```bash
git add README.md tests/manual/macos-installer.md \
  docs/releases/installer-acceptance-template.md \
  docs/releases/v0.1.0-acceptance.md
git commit -m "docs: explain unsigned friends beta distribution"
```

---

### Task 5: Run Complete Local Verification and Record the Implementation Evidence

**Files:**
- Create: `.superpowers/sdd/2026-08-23-kopper-unsigned-friends-release/implementation-report.md`
- Review: all files changed since `d56f4ab`

**Interfaces:**
- Consumes: completed Tasks 1–4 on a clean feature branch based on `d56f4ab`.
- Produces: evidence-backed implementation ready to merge and push, with no claim that a public release exists.

- [ ] **Step 1: Run the focused gates from a clean shell**

```bash
pnpm exec vitest run scripts/install.test.ts scripts/workflows.test.ts
pnpm verify:installer
pnpm validate:release-docs
pnpm exec actionlint .github/workflows/ci.yml \
  .github/workflows/release.yml \
  .github/workflows/promote-release.yml
```

Expected: focused tests PASS, installer syntax exits 0, traceability reports 91 rows, and actionlint exits 0.

- [ ] **Step 2: Run the full quality gates**

```bash
pnpm test
pnpm typecheck
pnpm build
env -u ELECTRON_RUN_AS_NODE pnpm test:e2e
pnpm audit:deps
pnpm audit:source
git diff --check d56f4ab..HEAD
```

Expected: every command exits 0. Record exact test-file/test counts and E2E counts from the terminal rather than copying older numbers.

- [ ] **Step 3: Perform source-level release safety scans**

```bash
rg -n "secrets\.|APPLE_API_|CSC_|notarytool|stapler|package:release" \
  .github package.json scripts install.sh README.md \
  tests/manual/macos-installer.md docs/releases/installer-acceptance-template.md
rg -n "xattr|spctl|codesign|Gatekeeper" install.sh scripts/install.test.ts README.md \
  tests/manual/macos-installer.md docs/releases/installer-acceptance-template.md
rg -n "idandwon/kopper|Kopper-\$\{version\}-universal\.dmg|com\.kopper\.app" \
  install.sh .github README.md scripts tests
```

Expected: the first scan returns no active-path credential/signing hits; the second contains documentation prohibitions and negative test assertions only, with no installer execution; the third confirms the fixed origin, artifact name, and bundle identifier across producer and consumer boundaries.

- [ ] **Step 4: Review the complete diff against the spec**

```bash
git diff --stat d56f4ab..HEAD
git diff --check d56f4ab..HEAD
git log --oneline d56f4ab..HEAD
git status --short --branch
```

Review each spec section against the diff. Specifically verify that launch failure cannot enter rollback after `transaction_phase="committed"`, the tag workflow still creates a draft, promotion still checks exact assets and immutability, and historical signed evidence was not rewritten as passed.

- [ ] **Step 5: Write the implementation report**

Create `.superpowers/sdd/2026-08-23-kopper-unsigned-friends-release/implementation-report.md` with:

```markdown
# Kopper Unsigned Friends Release Implementation Report

## Scope

Implemented the approved unsigned friends-beta installer and release path. No public tag, draft, publication, or physical-Mac acceptance is claimed in this local implementation report.

## Commits

| Task | Commit | Result |
| Installer | Record `git rev-parse <installer commit>` | Record the focused RED and GREEN commands and bounded output |
| Draft workflow | Record `git rev-parse <draft-workflow commit>` | Record the focused RED and GREEN commands and bounded output |
| Promotion | Record `git rev-parse <promotion commit>` | Record the focused RED and GREEN commands and bounded output |
| Documentation | Record `git rev-parse <documentation commit>` | Record the traceability and safety-scan output |

## Verification

| Command | Result | Exact evidence |
| Focused Vitest | Pass/Fail | Record file and test counts plus exit status |
| Full Vitest | Pass/Fail | Record file and test counts plus exit status |
| Typecheck/build/E2E | Pass/Fail | Record each exit status and E2E count |
| Installer/docs/workflows | Pass/Fail | Record syntax, 91-row traceability, and actionlint results |
| Dependency/source audits | Pass/Fail | Record bounded result and exit status |

## Safety review

- Fixed public origin: record the `rg` result for `idandwon/kopper`.
- Apple credentials absent from active path: record the credential scan result.
- Signing/notarization explicitly disabled: record the exact `package:beta` command.
- Installer never bypasses Gatekeeper or removes quarantine: record the installer safety scan.
- Draft-first and immutable publication controls retained: record the workflow test result.

## External handoff

- Push/CI: Not run until Task 6.
- Tag workflow/draft: Not run until Task 6.
- Physical unsigned acceptance: Not run until Task 6.
- Immutable promotion: Requires fresh explicit approval after draft inspection.
```

Replace every `Record ...` instruction with actual evidence before committing the report.

- [ ] **Step 6: Commit the verified report**

```bash
git add .superpowers/sdd/2026-08-23-kopper-unsigned-friends-release/implementation-report.md
git commit -m "docs: record unsigned beta implementation evidence"
git status --short --branch
```

Expected: clean feature worktree and commits containing only the planned source, test, workflow, and documentation changes.

---

### Task 6: Merge, Push, Produce the Draft, and Stop Before Immutable Publication

**Files:**
- Create after draft testing: `docs/releases/v0.1.0-unsigned-beta-acceptance.md`
- Modify after external checks: `.superpowers/sdd/2026-08-23-kopper-unsigned-friends-release/implementation-report.md`

**Interfaces:**
- Consumes: verified feature commits, public `idandwon/kopper`, repository immutable releases, and the protected `release` environment.
- Produces: a tested v0.1.0 draft and a bounded physical acceptance record; immutable publication is a separate explicitly approved action.

- [ ] **Step 1: Integrate the feature branch into local main**

Use `superpowers:finishing-a-development-branch`. From the main worktree, verify clean status and ancestry before a non-interactive fast-forward merge:

```bash
git status --short --branch
git merge --ff-only feature/unsigned-friends-release
git log --oneline --decorate -8
```

Expected: local `main` contains the spec, plan, implementation, and evidence commits with no merge commit and a clean worktree.

- [ ] **Step 2: Push main and require green CI**

```bash
git push origin main
main_sha="$(git rev-parse HEAD)"
main_run_id=""
for attempt in {1..12}; do
  main_run_id="$(
    gh run list --repo idandwon/kopper --branch main \
      --json databaseId,headSha \
      --jq ".[] | select(.headSha == \"$main_sha\") | .databaseId" | head -1
  )"
  test -z "$main_run_id" || break
  sleep 5
done
test -n "$main_run_id"
gh run watch --repo idandwon/kopper "$main_run_id" --exit-status
```

Expected: pushed `main` equals local `main` and the CI run for that exact SHA exits successfully. Record the SHA and run URL in the implementation report.

- [ ] **Step 3: Verify repository release prerequisites without changing them**

```bash
gh api --method GET \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  repos/idandwon/kopper/immutable-releases
gh api repos/idandwon/kopper/environments/release
gh secret list --repo idandwon/kopper --env release
```

Expected: immutable releases report enabled, the `release` environment exists, and no Apple/signing secret is required. If the authenticated token cannot read the Administration endpoint, record that limitation and verify the setting in GitHub repository settings before tagging.

- [ ] **Step 4: Create and push the exact v0.1.0 tag**

```bash
version="$(node -p 'require("./package.json").version')"
test "$version" = "0.1.0"
test -z "$(git status --porcelain)"
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
git tag -a "v${version}" -m "Kopper v${version} unsigned friends beta"
git push origin "v${version}"
```

Expected: the tag points at the exact clean, CI-green package-version commit. Do not force or move the tag.

- [ ] **Step 5: Watch the tag workflow and inspect the draft**

```bash
release_sha="$(git rev-list -n 1 v0.1.0)"
release_run_id=""
for attempt in {1..12}; do
  release_run_id="$(
    gh run list --repo idandwon/kopper --workflow release.yml \
      --json databaseId,headSha \
      --jq ".[] | select(.headSha == \"$release_sha\") | .databaseId" | head -1
  )"
  test -z "$release_run_id" || break
  sleep 5
done
test -n "$release_run_id"
gh run watch --repo idandwon/kopper "$release_run_id" --exit-status
gh release view v0.1.0 --repo idandwon/kopper \
  --json tagName,isDraft,isImmutable,assets,url
draft_directory="$(mktemp -d "${TMPDIR:-/tmp}/kopper-v0.1.0-draft.XXXXXX")"
gh release download v0.1.0 --repo idandwon/kopper --dir "$draft_directory"
find "$draft_directory" -maxdepth 1 -type f -print
(cd "$draft_directory" && shasum -a 256 -c Kopper-0.1.0-universal.dmg.sha256)
cmp "$draft_directory/install.sh" install.sh
```

Expected: one draft with exactly the three required assets; checksum and installer comparison pass. Preserve the temporary directory until physical acceptance finishes, then move it to Trash or remove only that exact validated path.

- [ ] **Step 6: Execute pre-promotion unsigned physical acceptance**

Copy `docs/releases/installer-acceptance-template.md` to `docs/releases/v0.1.0-unsigned-beta-acceptance.md`. Run UNSIGNED-01 through UNSIGNED-03 from `tests/manual/macos-installer.md` on a clean macOS 14+ standard account using the downloaded draft DMG. Record exact release run, commit, asset names, checksum, machine/macOS bounds, direct-or-Open-Anyway launch result, and store-preservation evidence.

Commit and push only the evidence record and implementation-report update:

```bash
git add docs/releases/v0.1.0-unsigned-beta-acceptance.md \
  .superpowers/sdd/2026-08-23-kopper-unsigned-friends-release/implementation-report.md
git commit -m "docs: record v0.1.0 unsigned beta acceptance"
git push origin main
```

The tag remains at the tested release source commit; the later evidence commit documents observations and must not move the immutable candidate tag.

- [ ] **Step 7: Stop and request explicit publication approval**

Report the exact tag, release-source commit, workflow URL, draft URL, three assets, SHA-256, physical test machine/macOS, UNSIGNED-01 through UNSIGNED-03 results, and all remaining concerns. Ask for explicit approval to publish `v0.1.0` through **Promote Release**. Do not dispatch the promotion workflow in the same turn as this report.

- [ ] **Step 8: After fresh approval, publish and verify immutability**

Only after the user explicitly approves the inspected draft:

```bash
gh workflow run promote-release.yml --repo idandwon/kopper -f tag=v0.1.0
promotion_run_id=""
for attempt in {1..12}; do
  promotion_run_id="$(
    gh run list --repo idandwon/kopper --workflow promote-release.yml \
      --json databaseId,headSha \
      --jq ".[] | select(.headSha == \"$release_sha\") | .databaseId" | head -1
  )"
  test -z "$promotion_run_id" || break
  sleep 5
done
test -n "$promotion_run_id"
gh run watch --repo idandwon/kopper "$promotion_run_id" --exit-status
gh release view v0.1.0 --repo idandwon/kopper \
  --json tagName,isDraft,isImmutable,assets,url
```

Expected: exact tag `v0.1.0`, `isDraft: false`, `isImmutable: true`, and exactly the same three assets. If publication succeeds but the final verification fails, do not edit or replace the release; investigate and use a new version if a correction is required.

- [ ] **Step 9: Run the public curl smoke check on a second clean account**

From a different clean macOS 14+ standard account:

```bash
curl -fsSL https://github.com/idandwon/kopper/releases/latest/download/install.sh | bash
```

Record UNSIGNED-04 through UNSIGNED-06: exit 0, installed target, exact version/ID, absence of bounded artifacts, running-process refusal and quit-and-upgrade behavior, data preservation, printed unsigned/Open Anyway guidance, and successful direct or manually approved launch. Append the evidence to `docs/releases/v0.1.0-unsigned-beta-acceptance.md` and update the implementation report with the public release URL, immutable result, smoke-test result, and the exact friend-facing command.

- [ ] **Step 10: Commit the post-publication evidence and final handoff**

```bash
git add docs/releases/v0.1.0-unsigned-beta-acceptance.md \
  .superpowers/sdd/2026-08-23-kopper-unsigned-friends-release/implementation-report.md
git commit -m "docs: record v0.1.0 public installer smoke test"
git push origin main
git status --short --branch
```

Expected: clean `main`, public immutable `v0.1.0`, complete bounded unsigned-beta evidence, and a copyable installer command for friends. State plainly that macOS may require the one-time Open Anyway action because the app is unsigned.
