# Post-publication macOS installer acceptance procedure

This procedure is a **post-publication** physical check for the public installer at `releases/latest`. It supplements, rather than replaces, [`tests/manual/macos-capture.md`](macos-capture.md), which remains the pre-promotion DMG acceptance gate. Do not use this procedure to approve promotion: the `latest` URL is unavailable until the release is published.

Run it on a physical Mac running macOS 14 or newer, from a newly created local standard account with no prior Kopper installation, data, Accessibility grant, login item, or running process. Do not install Git, Node.js, pnpm, Homebrew, or use `sudo`, a Gatekeeper bypass, quarantine removal, or an override. Record results in `docs/releases/installer-acceptance-template.md` for the exact published release.

## Evidence rules and setup

Record the published release URL, installer URL, exact tag, version, full commit SHA, tester, physical Mac model, architecture, macOS product/build version, and UTC start/end bounds. For every command, retain the command, exit status, UTC time, and at most 20 relevant output lines. Redact account names and home-directory prefixes; never include credentials, environment dumps, complete logs, or note contents beyond the inert fixture below. Preserve all failures and append retests rather than replacing observations.

Confirm the operating system before installation:

```bash
sw_vers
```

Create an inert existing-store fixture before installing. This verifies that installation and upgrade do not modify local notes without printing their contents:

```bash
STORE="$HOME/Library/Application Support/Kopper/kopper.json"
mkdir -p "$(dirname "$STORE")"
printf '%s\n' '{"schemaVersion":1,"notes":[]}' > "$STORE"
shasum -a 256 "$STORE"
```

Run the canonical command exactly once:

```bash
curl -fsSL https://github.com/idandwon/kopper/releases/latest/download/install.sh | bash
```

## Installed bundle and security checks

The target must be exactly `~/Applications/Kopper.app`. Record bounded bundle metadata and security assessment against that target only:

```bash
APP="$HOME/Applications/Kopper.app"
VERSION="<published version without the v prefix>"
test -d "$APP"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")" = "$VERSION"
/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Contents/Info.plist"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist")" = "com.kopper.app"
/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$APP/Contents/Info.plist"
codesign --verify --deep --strict "$APP"
spctl --assess --type execute "$APP"
```

Expected metadata: the promoted version/build, identifier `com.kopper.app`, and minimum system version `14.0`. Both security commands must exit 0.

Confirm the installer detached its DMG and removed its bounded staging/rollback paths:

```bash
MOUNT_CHECK_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/kopper-mount-check.XXXXXX")"
MOUNT_CHECK_SCRIPT="$MOUNT_CHECK_DIRECTORY/check-kopper-mounts.js"
MOUNT_STATE_PLIST="$MOUNT_CHECK_DIRECTORY/hdiutil-info.plist"
MOUNT_STATE_JSON="$MOUNT_CHECK_DIRECTORY/hdiutil-info.json"
EXPECTED_DMG="Kopper-${VERSION}-universal.dmg"
hdiutil info -plist > "$MOUNT_STATE_PLIST"
plutil -convert json -o "$MOUNT_STATE_JSON" "$MOUNT_STATE_PLIST"
cat > "$MOUNT_CHECK_SCRIPT" <<'JXA'
function run(argv) {
  const application = Application.currentApplication();
  application.includeStandardAdditions = true;
  const state = JSON.parse(application.read(Path(argv[0])));
  const expectedDmg = argv[1];
  if (!Array.isArray(state.images)) {
    throw new Error("hdiutil returned no structured images array");
  }

  const matches = [];
  for (const image of state.images) {
    const imagePath = image["image-path"];
    if (
      typeof imagePath === "string" &&
      imagePath.slice(imagePath.lastIndexOf("/") + 1) === expectedDmg
    ) {
      const mountPoints = (image["system-entities"] || [])
        .map((entity) => entity["mount-point"])
        .filter((mountPoint) => typeof mountPoint === "string");
      matches.push({ imagePath, mountPoints });
    }
  }

  if (matches.length > 0) {
    const boundedMatches = matches.slice(0, 20);
    throw new Error(
      `found ${matches.length} mounted ${expectedDmg} image(s): ${JSON.stringify(boundedMatches)}`,
    );
  }
  return `evaluated ${state.images.length} image(s); no exact ${expectedDmg} mount remains`;
}
JXA
mount_check_status=0
/usr/bin/osascript -l JavaScript "$MOUNT_CHECK_SCRIPT" "$MOUNT_STATE_JSON" "$EXPECTED_DMG" || mount_check_status=$?
rm -rf "$MOUNT_CHECK_DIRECTORY"
test "$mount_check_status" = "0"
installer_artifact="$(find "$HOME/Applications" -maxdepth 1 \( -name '.Kopper.app.install.*' -o -name '.Kopper.app.rollback.*' \) -print -quit)"
test -z "$installer_artifact"
```

Expected: the structured check evaluates every `hdiutil` image before bounding failure evidence, exits 0 only when no exact versioned Kopper DMG remains mounted, and the final `test` proves no bounded staging or rollback path exists.

## Upgrade, running-process, and onboarding observations

Before the repeated install, preserve a bounded comparison copy of the installed bundle. While Kopper is running, rerun the canonical command. It must fail without changing the installed bundle. Quit Kopper, rerun the same command, and confirm it succeeds:

```bash
BEFORE_APP="$HOME/.Kopper.app.before-repeated-install"
rm -rf "$BEFORE_APP"
ditto "$APP" "$BEFORE_APP"
curl -fsSL https://github.com/idandwon/kopper/releases/latest/download/install.sh | bash
diff -qr "$BEFORE_APP" "$APP" | sed -n '1,20p'
rm -rf "$BEFORE_APP"
```

Expected: the running-app installer invocation fails, and the bounded `diff` output is empty. After quitting Kopper, rerun the canonical command and confirm it succeeds. Then compare the inert fixture with its pre-install hash:

```bash
shasum -a 256 "$STORE"
```

The before and after SHA-256 values must be identical. Launch the installed app normally and complete the existing Accessibility onboarding without an override.

## Required observations

| ID | Required observation |
| --- | --- |
| INST-01 | The canonical curl command exits 0 on macOS 14+ without Git, Node.js, pnpm, Homebrew, sudo, a Gatekeeper bypass, or quarantine removal. |
| INST-02 | The installed target is exactly `~/Applications/Kopper.app`; bundle version, identifier `com.kopper.app`, and minimum system version `14.0` match the promoted release. |
| INST-03 | `codesign --verify --deep --strict` and `spctl --assess --type execute` accept the installed application. |
| INST-04 | After installation, no Kopper DMG remains mounted and no `.Kopper.app.install.*` or `.Kopper.app.rollback.*` path remains. |
| INST-05 | Running Kopper makes a repeated install fail without changing the installed bundle; after quitting, rerunning succeeds and preserves the SHA-256 of an inert `kopper.json` fixture. |
| INST-06 | The installed app launches normally and completes existing Accessibility onboarding without an override. |
