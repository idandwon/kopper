# Unsigned friends-beta macOS installer acceptance procedure

This procedure records physical acceptance for an unsigned friends beta. Use a clean macOS 14 Sonoma or newer standard account with no previous Kopper application, data, Accessibility grant, login item, or running process. `UNSIGNED-01` through `UNSIGNED-03` are pre-promotion evidence against the exact draft; `UNSIGNED-04` through `UNSIGNED-06` are required post-publication installer checks on a second clean account. The canonical `releases/latest` URL cannot resolve a draft release.

Do not use `sudo`, `xattr`, Gatekeeper disablement, quarantine removal, or another shell security bypass. Because Apple has not signed or notarized this beta, if macOS blocks first launch, use the one-time **System Settings → Privacy & Security → Open Anyway** path for Kopper. Record whether the launch was direct or needed that documented action.

## Evidence rules

Record the draft release URL and workflow URL, then the published release URL when applicable; also record the exact tag, version, full commit SHA, tester, physical Mac model, architecture, macOS product/build version, and UTC start/end bounds. For every command, retain the command, exit status, UTC time, and at most 20 relevant output lines. Redact account names and home-directory prefixes; never include credentials, environment dumps, complete logs, or note contents beyond the inert fixture below. Preserve every failure and append retests rather than replacing observations.

Confirm the operating system before each account's relevant procedure:

```bash
sw_vers
```

## Pre-promotion draft acceptance

Run this exact procedure in the first clean account. It downloads the three exact draft assets, but deliberately does **not** run the draft `install.sh`: its fixed `releases/latest` origin cannot address an unpublished draft.

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

Both `lipo` outputs must contain exactly `arm64` and `x86_64`. Exercise first launch through Finder: open `~/Applications/Kopper.app`; if macOS blocks it, open **System Settings → Privacy & Security** and choose **Open Anyway** once for Kopper. Record the direct or Open Anyway result and never use a shell security bypass.

After evidence capture, remove only the exact `ASSET_DIRECTORY` and the clean-account `TARGET`. Never remove the store unless the tester created it solely as this inert fixture and records that cleanup. Do not remove a mount point until `hdiutil detach "$MOUNT_POINT"` has succeeded.

## Post-publication canonical-installer acceptance

After explicit approval promotes the exact draft, use a second clean standard account. This is the first point at which `releases/latest` can resolve the immutable release. Create the inert existing-store fixture before installing and retain its SHA-256 value:

```bash
STORE="$HOME/Library/Application Support/Kopper/kopper.json"
mkdir -p "$(dirname "$STORE")"
printf '%s\n' '{"schemaVersion":1,"notes":[]}' > "$STORE"
STORE_BEFORE="$(shasum -a 256 "$STORE" | awk '{print $1}')"
curl -fsSL https://github.com/idandwon/kopper/releases/latest/download/install.sh | bash
```

Set the exact published version before inspecting the installed bundle:

```bash
APP="$HOME/Applications/Kopper.app"
VERSION="<published version without the v prefix>"
test -d "$APP"
test ! -L "$APP"
test "$(plutil -extract CFBundleIdentifier raw -o - "$APP/Contents/Info.plist")" = "com.kopper.app"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = "$VERSION"
test "$(plutil -extract LSMinimumSystemVersion raw -o - "$APP/Contents/Info.plist")" = "14.0"
```

The canonical installer must leave no exact versioned Kopper DMG mounted and no staging or rollback artifact. This structured check examines every `hdiutil` image before it bounds reported matches:

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

While Kopper is running, rerun the canonical installer. It must refuse without changing the installed app. Quit Kopper, rerun the same command, and confirm the upgrade succeeds and preserves the inert store hash:

```bash
BEFORE_APP="$HOME/.Kopper.app.before-repeated-install"
rm -rf "$BEFORE_APP"
ditto "$APP" "$BEFORE_APP"
running_install_status=0
curl -fsSL https://github.com/idandwon/kopper/releases/latest/download/install.sh | bash || running_install_status=$?
test "$running_install_status" != "0"
DIFF_OUTPUT="$BEFORE_APP.diff"
rm -f "$DIFF_OUTPUT"
diff_status=0
diff -qr "$BEFORE_APP" "$APP" > "$DIFF_OUTPUT" || diff_status=$?
sed -n '1,20p' "$DIFF_OUTPUT"
test "$diff_status" = "0"
rm -f "$DIFF_OUTPUT"
rm -rf "$BEFORE_APP"

# Quit Kopper before the next command.
curl -fsSL https://github.com/idandwon/kopper/releases/latest/download/install.sh | bash
test "$(shasum -a 256 "$STORE" | awk '{print $1}')" = "$STORE_BEFORE"
```

The first installer invocation above must exit nonzero while Kopper is running; retain that exit status rather than relying on shell `set -e`. The successful post-quit invocation must leave the transaction clean. If the installed app is blocked on first launch, use the documented **Open Anyway** action once; do not use a shell security bypass.

## Required observations

| ID | Required observation |
| --- | --- |
| UNSIGNED-01 | The exact draft contains only the versioned universal DMG, its matching SHA-256 file, and the tagged `install.sh`; checksum verification succeeds. |
| UNSIGNED-02 | The root-level real `Kopper.app` reports the exact version, bundle identifier `com.kopper.app`, minimum macOS `14.0`, and both `arm64` and `x86_64` runtime architectures. |
| UNSIGNED-03 | A manual draft installation to `~/Applications/Kopper.app` preserves the inert `kopper.json` hash and first launch either opens directly or succeeds after one System Settings → Privacy & Security → Open Anyway approval; no shell security bypass is used. |
| UNSIGNED-04 | After publication, the canonical installer leaves exactly `~/Applications/Kopper.app`, no mounted Kopper DMG, and no `.Kopper.app.install.*` or `.Kopper.app.rollback.*` artifact. |
| UNSIGNED-05 | After publication, running-process refusal and a subsequent quit-and-upgrade preserve the app transaction and the inert `kopper.json` SHA-256. |
| UNSIGNED-06 | After immutable publication, the canonical curl command exits 0 on a second clean macOS 14+ standard account and prints the unsigned-beta approval guidance. |
