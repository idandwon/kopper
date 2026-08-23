# Kopper Public macOS Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Kopper at `github.com/idandwon/kopper` with a one-command macOS installer that downloads, verifies, transactionally installs, and launches the latest promoted signed release.

**Architecture:** A root-level Bash 3.2-compatible `install.sh` resolves the latest published semantic-version release, verifies the versioned DMG checksum, Apple signature, and Gatekeeper assessment, then installs to `~/Applications/Kopper.app` with rollback. Existing GitHub release workflows upload the exact tagged installer as a third release asset and require that asset during promotion; mocked Vitest coverage exercises the script without network, disk-image, signing, or real Applications-directory access.

**Tech Stack:** Bash 3.2, built-in macOS command-line tools, GitHub Releases, GitHub Actions, Vitest, Node.js 24, pnpm 10.15

**Spec:** `docs/superpowers/specs/2026-08-23-kopper-curl-installer-design.md`

## Global Constraints

- The canonical public origin is exactly `https://github.com/idandwon/kopper`.
- The canonical command is exactly `curl -fsSL https://github.com/idandwon/kopper/releases/latest/download/install.sh | bash`.
- Support macOS 14 Sonoma or newer only.
- Install to exactly `~/Applications/Kopper.app`; never require `sudo`.
- Require no Git, Node.js, pnpm, Homebrew, or added runtime dependency on the destination Mac.
- Install only a versioned universal DMG from an exact `v<major>.<minor>.<patch>` published release.
- Never disable Gatekeeper, clear quarantine attributes, execute from the mounted DMG, or accept caller-controlled release origins.
- Preserve `~/Library/Application Support/Kopper/kopper.json` and all other data outside the app bundle.
- Keep automatic updates, analytics, telemetry, package managers, mirrors, forks, and configurable channels out of scope.
- A public repository and passing source tests do not prove that the curl command is live; that claim requires a promoted signed release and post-publication physical acceptance.

---

## Locked File Structure

```text
install.sh                                      Public installer and upgrade transaction
scripts/install.test.ts                         Hermetic installer behavior tests
package.json                                    Installer syntax verification command
.github/workflows/ci.yml                        Installer syntax gate on every change
.github/workflows/release.yml                   Upload tagged installer into draft release
.github/workflows/promote-release.yml           Download and compare installer before promotion
scripts/workflows.test.ts                       Workflow and release-asset contract tests
scripts/validate-release-doc-traceability.mjs   Exact three-asset final-release validation
README.md                                       User installation, upgrade, and uninstall guidance
tests/manual/macos-installer.md                 Post-publication physical installer procedure
docs/releases/installer-acceptance-template.md  Post-publication installer evidence record
```

Do not add a Homebrew tap, package installer, updater library, analytics hook, or installer framework.

### Task 1: Installer Preflight and Exact Release Resolution

**Files:**

- Create: `install.sh`
- Create: `scripts/install.test.ts`
- Modify: `package.json:7-23`
- Modify: `.github/workflows/ci.yml:27-35`

**Interfaces:**

- Consumes: `HOME`, macOS built-ins discoverable through `PATH`, and GitHub's redirect from `https://github.com/idandwon/kopper/releases/latest`.
- Produces: `install.sh` with no required arguments and `pnpm verify:installer`, which runs `bash -n install.sh`.
- Test seam: tests replace built-in commands through a temporary leading `PATH` entry and set `HOME` to a temporary directory; production code exposes no origin or verification override.

- [ ] **Step 1: Write the failing preflight and release-resolution tests**

Create `scripts/install.test.ts` with a harness that writes executable command shims into a temporary `bin` directory, runs the real root `install.sh` with `bash`, and removes the fixture after each case. The first tests must assert:

```ts
it("rejects non-macOS without contacting GitHub", () => {
  const fixture = createInstallerFixture({ platform: "Linux" });
  const result = fixture.run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Kopper requires macOS 14 or newer.");
  expect(fixture.calls()).not.toContainEqual(expect.objectContaining({ command: "curl" }));
});

it("rejects macOS 13 and root execution", () => {
  expect(createInstallerFixture({ macosVersion: "13.6.9" }).run().stderr)
    .toContain("Kopper requires macOS 14 or newer.");
  expect(createInstallerFixture({ userId: "0" }).run().stderr)
    .toContain("Do not run the Kopper installer as root or with sudo.");
});

it("accepts only the exact public semantic-version release redirect", () => {
  const malformed = createInstallerFixture({
    latestUrl: "https://github.com/idandwon/kopper/releases/tag/latest",
  }).run();
  expect(malformed.status).toBe(1);
  expect(malformed.stderr).toContain("GitHub returned an invalid Kopper release tag.");

  const valid = createInstallerFixture({
    latestUrl: "https://github.com/idandwon/kopper/releases/tag/v0.1.0",
    stopAfterDownloads: true,
  });
  valid.run();
  expect(valid.downloadUrls()).toEqual([
    "https://github.com/idandwon/kopper/releases/download/v0.1.0/Kopper-0.1.0-universal.dmg",
    "https://github.com/idandwon/kopper/releases/download/v0.1.0/Kopper-0.1.0-universal.dmg.sha256",
  ]);
});
```

The harness's default shims must emulate `uname`, `sw_vers`, `id`, `curl`, `hdiutil`, `shasum`, `codesign`, `spctl`, `ditto`, `open`, and `pgrep`, append every call as one JSON line to a fixture log, and use real `/bin/mkdir`, `/bin/mv`, and `/bin/rm` unless a test deliberately replaces one. `stopAfterDownloads` is harness behavior implemented by making the next shim fail after both URLs are recorded; it is not a production environment variable or installer option. Never call the network or real macOS signing tools.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
pnpm vitest run scripts/install.test.ts
```

Expected: FAIL because `install.sh` and the test harness behavior do not exist yet.

- [ ] **Step 3: Implement strict preflight and release resolution**

Start `install.sh` with these exact fixed boundaries and functions:

```bash
#!/bin/bash
set -euo pipefail

readonly KOPPER_REPOSITORY="idandwon/kopper"
readonly KOPPER_RELEASES_URL="https://github.com/${KOPPER_REPOSITORY}/releases"
readonly KOPPER_INSTALL_DIRECTORY="${HOME}/Applications"
readonly KOPPER_TARGET="${KOPPER_INSTALL_DIRECTORY}/Kopper.app"

fail() {
  printf 'Kopper installer: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required macOS command not found: $1."
}

version_major() {
  printf '%s\n' "${1%%.*}"
}
```

Then implement, in this order:

```bash
[[ "$(uname -s)" == "Darwin" ]] || fail "Kopper requires macOS 14 or newer."
[[ "$(id -u)" != "0" ]] || fail "Do not run the Kopper installer as root or with sudo."

macos_version="$(sw_vers -productVersion)"
[[ "$(version_major "$macos_version")" =~ ^[0-9]+$ ]] || fail "Could not determine the macOS version."
(( $(version_major "$macos_version") >= 14 )) || fail "Kopper requires macOS 14 or newer."

for command_name in curl hdiutil shasum codesign spctl ditto open pgrep mktemp sw_vers; do
  require_command "$command_name"
done

printf 'Finding latest Kopper release...\n'
latest_url="$(curl -fsSL -o /dev/null -w '%{url_effective}' "${KOPPER_RELEASES_URL}/latest")" \
  || fail "Could not find a published Kopper release."
tag="${latest_url##*/}"
[[ "$latest_url" == "${KOPPER_RELEASES_URL}/tag/${tag}" ]] \
  || fail "GitHub returned an invalid Kopper release URL."
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] \
  || fail "GitHub returned an invalid Kopper release tag."

version="${tag#v}"
dmg_name="Kopper-${version}-universal.dmg"
checksum_name="${dmg_name}.sha256"
asset_base="${KOPPER_RELEASES_URL}/download/${tag}"
```

Use `mktemp -d "${TMPDIR:-/tmp}/kopper-install.XXXXXX"` only after preflight passes. Register cleanup immediately; Task 2 will complete its mount, staging, and rollback responsibilities.

- [ ] **Step 4: Add the syntax command and CI gate**

Add this package script without changing existing script meanings:

```json
"verify:installer": "bash -n install.sh"
```

Add this CI step immediately after dependency installation and before the test suite:

```yaml
      - name: Validate public installer syntax
        run: pnpm verify:installer
```

Extend `scripts/workflows.test.ts` in Task 3 to lock the CI ordering; do not duplicate workflow parsing here.

- [ ] **Step 5: Run the focused gates and confirm GREEN**

Run:

```bash
pnpm verify:installer
pnpm vitest run scripts/install.test.ts
```

Expected: PASS; the valid-release case proceeds to its controlled download stop, while platform, version, root, missing-command, missing-release, malformed-URL, and malformed-tag cases exit 1 with exact messages.

- [ ] **Step 6: Commit the preflight unit**

```bash
git add install.sh scripts/install.test.ts package.json .github/workflows/ci.yml
git commit -m "feat: add public installer preflight"
```

### Task 2: Verified Download and Transactional Installation

**Files:**

- Modify: `install.sh`
- Modify: `scripts/install.test.ts`

**Interfaces:**

- Consumes: `tag`, `version`, `dmg_name`, `checksum_name`, `asset_base`, the temporary directory, and fixed `KOPPER_TARGET` from Task 1.
- Produces: a verified installation at `~/Applications/Kopper.app`, rollback-safe replacement, deterministic cleanup, and launch through `open`.
- Invariant: no existing target changes until the downloaded DMG, mounted app, and staged app all pass verification.

- [ ] **Step 1: Add failing end-to-end shell behavior tests**

Extend the hermetic harness with scenarios that assert exact filesystem outcomes and call ordering:

```ts
it("downloads, verifies, installs, cleans up, and launches", () => {
  const fixture = createInstallerFixture();
  const result = fixture.run();
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Kopper installed successfully.");
  expect(fixture.installedMarker()).toBe("new-v0.1.0");
  expect(fixture.hasMountedImage()).toBe(false);
  expect(fixture.temporaryArtifacts()).toEqual([]);
  expectCallSubsequence(fixture.callsInOrder(), [
    "shasum", "spctl-dmg", "hdiutil-attach", "codesign-mounted",
    "spctl-mounted", "ditto", "codesign-staged", "spctl-staged",
    "codesign-installed", "spctl-installed", "hdiutil-detach", "open",
  ]);
});

it("leaves the existing application untouched when verification fails", () => {
  for (const failure of ["checksum", "dmg-gatekeeper", "mounted-codesign", "staged-gatekeeper"]) {
    const fixture = createInstallerFixture({ failure, existingApp: "old" });
    expect(fixture.run().status).toBe(1);
    expect(fixture.installedMarker()).toBe("old");
    expect(fixture.temporaryArtifacts()).toEqual([]);
  }
});

it("restores the previous application when replacement or final verification fails", () => {
  for (const failure of ["replacement-move", "installed-codesign", "launch"]) {
    const fixture = createInstallerFixture({ failure, existingApp: "old" });
    expect(fixture.run().status).toBe(1);
    expect(fixture.installedMarker()).toBe("old");
    expect(fixture.temporaryArtifacts()).toEqual([]);
  }
});

it("refuses to replace a running Kopper process", () => {
  const fixture = createInstallerFixture({ running: true, existingApp: "old" });
  const result = fixture.run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Quit Kopper, then run this command again.");
  expect(fixture.installedMarker()).toBe("old");
});
```

Also cover download failure, checksum file naming mismatch, zero or multiple root-level `.app` bundles, read-only mount flags, first installation with no prior target, preservation of a sibling sentinel under the temporary `HOME`, and cleanup after signals or ordinary failures.

Define `expectCallSubsequence(actual, expected)` in the test file to compare each expected marker against a strictly increasing index in `actual`; this proves order while allowing preflight and download calls around the security-critical subsequence.

- [ ] **Step 2: Run the focused installer test and confirm RED**

Run:

```bash
pnpm vitest run scripts/install.test.ts
```

Expected: FAIL because Task 1 stops after release resolution and does not yet verify or install an app.

- [ ] **Step 3: Implement download, verification, and read-only mounting**

Use exact tag-specific URLs and HTTPS-only downloads:

```bash
printf 'Downloading Kopper %s...\n' "$tag"
curl -fL --retry 3 --proto '=https' --tlsv1.2 \
  -o "${temporary_directory}/${dmg_name}" "${asset_base}/${dmg_name}" \
  || fail "Could not download ${dmg_name}."
curl -fL --retry 3 --proto '=https' --tlsv1.2 \
  -o "${temporary_directory}/${checksum_name}" "${asset_base}/${checksum_name}" \
  || fail "Could not download ${checksum_name}."

printf 'Verifying checksum and Apple signature...\n'
checksum_lines=()
while IFS= read -r checksum_line || [[ -n "$checksum_line" ]]; do
  checksum_lines+=("$checksum_line")
done < "${temporary_directory}/${checksum_name}"
[[ "${#checksum_lines[@]}" == "1" ]] || fail "The Kopper checksum file is invalid."
checksum_hash="${checksum_lines[0]%% *}"
[[ "$checksum_hash" =~ ^[0-9a-f]{64}$ ]] \
  || fail "The Kopper checksum file is invalid."
[[ "${checksum_lines[0]}" == "${checksum_hash}  ${dmg_name}" ]] \
  || fail "The Kopper checksum file is invalid."
(
  cd "$temporary_directory"
  shasum -a 256 -c "$checksum_name"
) >/dev/null || fail "The Kopper download checksum did not match."

spctl --assess --type open --context context:primary-signature \
  "${temporary_directory}/${dmg_name}" >/dev/null 2>&1 \
  || fail "Gatekeeper rejected the Kopper disk image."

hdiutil attach -readonly -nobrowse -mountpoint "$mount_point" \
  "${temporary_directory}/${dmg_name}" >/dev/null \
  || fail "Could not mount the Kopper disk image."
mounted=1
```

Use Bash `nullglob` and an array to require exactly one root-level app and require its basename to equal `Kopper.app`. Implement a shared `verify_app()` that runs both commands and returns nonzero on either failure:

```bash
verify_app() {
  local app_path="$1"
  codesign --verify --deep --strict "$app_path" >/dev/null 2>&1 &&
    spctl --assess --type execute "$app_path" >/dev/null 2>&1
}
```

Do not run `open`, the Kopper executable, or any file from the mounted image during verification.

- [ ] **Step 4: Implement staging, rollback, cleanup, and launch**

Create `~/Applications`, then use hidden paths unique to the process:

```bash
staged_target="${KOPPER_INSTALL_DIRECTORY}/.Kopper.app.install.$$"
rollback_target="${KOPPER_INSTALL_DIRECTORY}/.Kopper.app.rollback.$$"
```

Track whether a new target has replaced the old one. The EXIT trap must:

1. disable itself before cleanup;
2. capture and preserve the original exit status;
3. remove any staging path;
4. after failure, remove a newly installed target and restore the rollback when one exists;
5. detach the exact mount point when `mounted=1`;
6. remove the temporary directory; and
7. exit with the original status, or with failure if rollback/cleanup cannot preserve a safe installation.

Perform the transaction in this exact order:

```bash
pgrep -x Kopper >/dev/null 2>&1 &&
  fail "Quit Kopper, then run this command again."

mkdir -p "$KOPPER_INSTALL_DIRECTORY"
ditto "$mounted_app" "$staged_target" || fail "Could not stage Kopper."
verify_app "$staged_target" || fail "The staged Kopper application failed verification."

if [[ -e "$KOPPER_TARGET" ]]; then
  mv "$KOPPER_TARGET" "$rollback_target" || fail "Could not prepare the existing Kopper installation for upgrade."
fi
mv "$staged_target" "$KOPPER_TARGET" || fail "Could not install Kopper."
installed_new=1
verify_app "$KOPPER_TARGET" || fail "The installed Kopper application failed verification."
cleanup_downloads || fail "Could not clean up the Kopper disk image."
open "$KOPPER_TARGET" || fail "Kopper was installed but could not be launched."

rm -rf "$rollback_target"
rollback_target=""
printf 'Kopper installed successfully.\n'
```

`cleanup_downloads()` owns DMG detachment and temporary-directory removal. The EXIT trap calls it after every early exit; the success path calls it once before launch and clears its state so the EXIT trap is idempotent. This preserves the required detach-before-launch order. It may print a bounded cleanup warning, but never dump command output or environment values.

- [ ] **Step 5: Run focused tests and syntax validation**

Run:

```bash
pnpm verify:installer
pnpm vitest run scripts/install.test.ts
```

Expected: PASS for every success, failure, rollback, fixed-origin, and cleanup scenario. Confirm the tests never create `~/Applications/Kopper.app` in the real user home.

- [ ] **Step 6: Commit the verified installer**

```bash
git add install.sh scripts/install.test.ts
git commit -m "feat: install verified Kopper releases"
```

### Task 3: Publish and Enforce the Tagged Installer Asset

**Files:**

- Modify: `.github/workflows/release.yml:50-76`
- Modify: `.github/workflows/promote-release.yml:44-111`
- Modify: `scripts/workflows.test.ts`
- Modify: `scripts/validate-release-doc-traceability.mjs:310-324`

**Interfaces:**

- Consumes: the exact-tag `install.sh`, `Kopper-<version>-universal.dmg`, and its checksum.
- Produces: a draft release whose asset list is exactly those three files and a promotion gate that compares downloaded `install.sh` byte-for-byte with the tagged checkout.
- Final validator contract: `expectedNames` is `[options.artifact, options.checksum, "install.sh"]`.

- [ ] **Step 1: Write failing release-contract tests**

Extend `scripts/workflows.test.ts` with these assertions:

```ts
it("publishes the syntax-checked installer from the exact tagged checkout", () => {
  const checksum = step(release, "Generate exact release assets");
  expect(checksum).toContain("bash -n install.sh");
  expect(checksum).toContain("installer_path=install.sh");

  const createRelease = step(release, "Create draft GitHub Release");
  expect(createRelease).toContain("INSTALLER_PATH: ${{ steps.assets.outputs.installer_path }}");
  expect(createRelease).toContain('"$INSTALLER_PATH"');
});

it("downloads and compares the installer before promotion", () => {
  const inspect = step(promote, "Inspect draft and verify exact candidate assets");
  expect(inspect).toContain('--pattern "$INSTALLER"');
  expect(inspect).toContain('cmp "$INSTALLER" "$GITHUB_WORKSPACE/install.sh"');
  expect(promote.indexOf(inspect)).toBeLessThan(
    promote.indexOf(step(promote, "Publish validated draft release")),
  );
});
```

Update release JSON fixtures to include `{ name: "install.sh" }`. Add one final-validation case with a missing installer and one with an unexpected fourth asset; both must contain:

```text
GitHub Release assets do not exactly match the DMG, checksum, and installer evidence.
```

Add an assertion that the CI `Validate public installer syntax` step precedes `Run tests`.

- [ ] **Step 2: Run workflow tests and confirm RED**

Run:

```bash
pnpm vitest run scripts/workflows.test.ts
```

Expected: FAIL because the workflows currently publish and validate only the DMG and checksum.

- [ ] **Step 3: Update draft release creation**

Rename `Generate exact DMG checksum` to `Generate exact release assets`, change its `id` to `assets`, and add:

```bash
test -f install.sh
bash -n install.sh
printf 'installer_path=install.sh\n' >> "$GITHUB_OUTPUT"
```

Keep the existing versioned DMG/checksum outputs. In `Create draft GitHub Release`, bind all three outputs and pass all three quoted paths to `gh release create`. Do not copy the installer from another branch, URL, artifact job, or generated string.

- [ ] **Step 4: Update promotion inspection**

Have `Verify exact tag version and commit` output `installer=install.sh`. Pass it into the inspection step as `INSTALLER`, add the third `gh release download --pattern`, require exactly one downloaded installer, run `bash -n "$INSTALLER"`, and compare it to the checkout:

```bash
test -f "$INSTALLER"
bash -n "$INSTALLER"
cmp "$INSTALLER" "$GITHUB_WORKSPACE/install.sh"
```

Keep this inspection before final evidence validation and publication.

- [ ] **Step 5: Update exact asset validation**

Change the final validator to:

```js
const expectedNames = [options.artifact, options.checksum, "install.sh"].sort();
if (JSON.stringify(assetNames) !== JSON.stringify(expectedNames)) {
  errors.push(
    "GitHub Release assets do not exactly match the DMG, checksum, and installer evidence.",
  );
}
```

No new command-line argument is needed because the installer asset name is a fixed public contract.

- [ ] **Step 6: Run focused workflow and traceability gates**

Run:

```bash
pnpm vitest run scripts/workflows.test.ts
pnpm validate:release-docs
```

Expected: PASS; the current incomplete v0.1.0 final fixture still fails for its existing evidence reasons, not because its three-asset fixture is malformed.

- [ ] **Step 7: Commit release integration**

```bash
git add .github/workflows/release.yml .github/workflows/promote-release.yml scripts/workflows.test.ts scripts/validate-release-doc-traceability.mjs
git commit -m "ci: publish tagged Kopper installer"
```

### Task 4: Public Installation Documentation and Post-publication Acceptance

**Files:**

- Modify: `README.md:1-78`
- Create: `tests/manual/macos-installer.md`
- Create: `docs/releases/installer-acceptance-template.md`

**Interfaces:**

- Consumes: the canonical command and installer behavior from Tasks 1-3.
- Produces: ordinary-user install/upgrade/uninstall instructions and a separate post-publication acceptance record.
- Boundary: installer acceptance is intentionally separate from the pre-promotion DMG acceptance record because `/releases/latest/download/install.sh` is unavailable until the release is published; it must not create a circular promotion gate.

- [ ] **Step 1: Add failing documentation-contract tests**

Extend `scripts/install.test.ts` with a source-level contract test:

```ts
it("documents the exact public command without security bypasses", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  expect(readme).toContain(
    "curl -fsSL https://github.com/idandwon/kopper/releases/latest/download/install.sh | bash",
  );
  expect(readme).toContain("~/Applications/Kopper.app");
  expect(readme).not.toMatch(/xattr|spctl --master-disable|Open Anyway/u);
});
```

Run `pnpm vitest run scripts/install.test.ts`; expect FAIL because README has no public installation section.

- [ ] **Step 2: Add the README installation section**

Insert this immediately after the opening description and before privacy details:

````markdown
## Install

Kopper requires macOS 14 Sonoma or newer. Install the latest signed and notarized release with:

```bash
curl -fsSL https://github.com/idandwon/kopper/releases/latest/download/install.sh | bash
```

Kopper is installed for your account at `~/Applications/Kopper.app` and opens automatically. Complete the in-app Accessibility onboarding if you want global selection capture.

To upgrade, quit Kopper and run the same command again. To uninstall the application, move `~/Applications/Kopper.app` to Trash. Your local notes remain at `~/Library/Application Support/Kopper/kopper.json` unless you deliberately remove that file.
````

Update the Releases section to say the draft contains the DMG, checksum, and exact tagged installer. Keep unsigned development packaging clearly labeled as non-distributable.

- [ ] **Step 3: Write the post-publication physical procedure**

Create `tests/manual/macos-installer.md` with an explicit clean-account procedure and these six rows:

```markdown
| ID | Required observation |
| --- | --- |
| INST-01 | The canonical curl command exits 0 on macOS 14+ without Git, Node.js, pnpm, Homebrew, sudo, a Gatekeeper bypass, or quarantine removal. |
| INST-02 | The installed target is exactly `~/Applications/Kopper.app`; bundle version, identifier `com.kopper.app`, and minimum system version `14.0` match the promoted release. |
| INST-03 | `codesign --verify --deep --strict` and `spctl --assess --type execute` accept the installed application. |
| INST-04 | After installation, no Kopper DMG remains mounted and no `.Kopper.app.install.*` or `.Kopper.app.rollback.*` path remains. |
| INST-05 | Running Kopper makes a repeated install fail without changing the installed bundle; after quitting, rerunning succeeds and preserves the SHA-256 of an inert `kopper.json` fixture. |
| INST-06 | The installed app launches normally and completes existing Accessibility onboarding without an override. |
```

Include exact bounded commands for `sw_vers`, bundle metadata, `codesign`, `spctl`, `hdiutil info`, `find "$HOME/Applications" -maxdepth 1`, and before/after `shasum -a 256` of an inert test store. State that this procedure runs only after publication and supplements, rather than replaces, `tests/manual/macos-capture.md`.

- [ ] **Step 4: Add the installer acceptance template**

Create `docs/releases/installer-acceptance-template.md` with release URL, exact tag/version/commit, installer URL, physical Mac metadata, UTC bounds, and one `Pass | Fail | Not run` evidence row for each `INST-01` through `INST-06`. Require bounded output and preserve all failed/retested observations.

Do not add these rows to `docs/releases/acceptance-template.md` or `scripts/validate-release-doc-traceability.mjs`; those are pre-promotion gates and cannot truthfully exercise the latest published URL.

- [ ] **Step 5: Run documentation and installer tests**

Run:

```bash
pnpm vitest run scripts/install.test.ts scripts/workflows.test.ts
pnpm validate:release-docs
```

Expected: PASS with no change to the existing count of 91 pre-promotion canonical rows.

- [ ] **Step 6: Commit documentation and acceptance procedure**

```bash
git add README.md tests/manual/macos-installer.md docs/releases/installer-acceptance-template.md scripts/install.test.ts
git commit -m "docs: document one-command Kopper install"
```

### Task 5: Verify the Complete Installer Change

**Files:**

- Verify only; modify a task-owned file only if a failing command reveals a defect in that task.

**Interfaces:**

- Consumes: all implementation commits from Tasks 1-4.
- Produces: bounded local evidence for syntax, installer behavior, workflow contracts, release documentation, application build, E2E, and audits.

- [ ] **Step 1: Confirm the worktree and installer source are cleanly reviewable**

Run:

```bash
git status --short
git diff --check HEAD~4..HEAD
bash -n install.sh
```

Expected: no uncommitted files, no whitespace errors, and installer syntax exit 0.

- [ ] **Step 2: Run the complete automated gate**

Run each command independently and retain its exit code:

```bash
pnpm verify:installer
pnpm test
pnpm validate:release-docs
pnpm typecheck
pnpm build
env -u ELECTRON_RUN_AS_NODE pnpm test:e2e
pnpm audit:deps
pnpm audit:source
```

Expected: every command exits 0. If `actionlint` is installed, also run `actionlint .github/workflows/*.yml`; otherwise record that workflow structure is covered by `scripts/workflows.test.ts` and do not claim an actionlint pass.

- [ ] **Step 3: Review installer safety invariants**

Run:

```bash
rg -n "^[[:space:]]*sudo[[:space:]]|xattr|master-disable|eval[[:space:]]|source[[:space:]]" install.sh README.md
rg -n "idandwon/kopper|Kopper-.*-universal\.dmg|install\.sh" install.sh .github/workflows scripts README.md
```

Expected: the first search has no output because there is no `sudo` invocation, quarantine removal, Gatekeeper disablement, `eval`, or downloaded-script sourcing; every release origin is `idandwon/kopper`; release workflows contain the exact three installer-facing assets.

- [ ] **Step 4: Record the live-release boundary**

Do not run the canonical curl installer against `main` or an unsigned local artifact. Report separately:

- source implementation verification status;
- whether `idandwon/kopper` exists publicly;
- whether the protected `release` environment contains all five required Apple secrets;
- whether an exact version tag has produced a draft signed release;
- whether pre-promotion physical DMG acceptance is complete;
- whether the draft was promoted; and
- whether post-publication `tests/manual/macos-installer.md` acceptance ran.

No source-only result permits the statement “the installer is live.”

### Task 6: Create the Public GitHub Origin

**Files:**

- External GitHub repository: `idandwon/kopper`
- Local Git configuration: add `origin`

**Interfaces:**

- Consumes: a clean local `main` branch and authenticated GitHub CLI account `idandwon`.
- Produces: public repository `https://github.com/idandwon/kopper` with local `origin` and pushed `main`.
- Current verified state on 2026-08-23: `gh auth status` is logged in as `idandwon`; `idandwon/kopper` does not yet exist; the local repository has no remote.

- [ ] **Step 1: Reconfirm exact publication state**

Run:

```bash
git status --short --branch
git remote -v
gh auth status
gh repo view idandwon/kopper --json nameWithOwner,visibility,url
```

Expected before creation: clean `main`, no existing remote, authenticated account `idandwon`, and repository lookup reports that `idandwon/kopper` does not exist. Stop if the repository has appeared or any remote points elsewhere; resolve ownership instead of overwriting or repointing it.

- [ ] **Step 2: Create and push the public repository**

Run exactly once:

```bash
gh repo create idandwon/kopper --public --source=. --remote=origin --push
```

Expected: GitHub creates the public repository, adds `origin`, and pushes the complete `main` history.

- [ ] **Step 3: Verify visibility and exact remote**

Run:

```bash
gh repo view idandwon/kopper --json nameWithOwner,visibility,url,defaultBranchRef
git remote get-url origin
git ls-remote --heads origin main
```

Expected: `nameWithOwner` is `idandwon/kopper`, visibility is `PUBLIC`, default branch is `main`, local origin is the same repository, and remote `main` resolves to the local pushed commit.

- [ ] **Step 4: Create the protected release environment without adding credentials to source**

Run:

```bash
gh api --method PUT repos/idandwon/kopper/environments/release
```

Then enter each secret value through `gh secret set` standard input or the GitHub environment UI; never place values in shell history, files, this plan, or logs:

```bash
gh secret set APPLE_API_KEY_P8 --env release --repo idandwon/kopper
gh secret set APPLE_API_KEY_ID --env release --repo idandwon/kopper
gh secret set APPLE_API_ISSUER --env release --repo idandwon/kopper
gh secret set CSC_LINK --env release --repo idandwon/kopper
gh secret set CSC_KEY_PASSWORD --env release --repo idandwon/kopper
```

This step requires the repository owner's secure Apple Developer and signing materials. If they are unavailable, stop after public source publication and report that signed releases and the canonical installer remain blocked.

- [ ] **Step 5: Hand off to the existing protected release process**

Do not create or push a version tag merely to make the URL return something. Follow `README.md` and `tests/manual/macos-capture.md` on an exact clean release commit: create the matching tag, allow `.github/workflows/release.yml` to produce the draft, complete the pre-promotion acceptance record, and run Promote Release only when every required gate passes.

After publication, run `tests/manual/macos-installer.md` and save a completed copy of `docs/releases/installer-acceptance-template.md` for that exact release. A failed post-publication installer check requires correcting the source and issuing a new semantic version; never replace a versioned asset in place.

## Execution Notes

- Tasks 1-4 are source implementation and must use TDD.
- Task 5 is the completion gate and produces evidence, not a commit.
- Task 6 mutates GitHub and must run only after source review and verification pass.
- The repository may be public before Apple credentials exist, but the README install command will return no published release until the protected release process succeeds.
- The current `v0.1.0` acceptance record remains historical evidence. Do not rewrite earlier command results; append only new evidence from the exact new release commit.
