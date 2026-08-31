# Unsigned friends-beta macOS installer acceptance procedure

This procedure records physical acceptance for an unsigned friends beta. Use a clean macOS 14 Sonoma or newer standard account with no previous Kopper application, data, Accessibility grant, login item, or running process. `UNSIGNED-01` through `UNSIGNED-03` are pre-promotion evidence against the exact draft; `UNSIGNED-04` through `UNSIGNED-06` are required post-publication installer checks on a second clean account. The canonical `releases/latest` URL cannot resolve a draft release.

Do not use `sudo`, `xattr`, Gatekeeper disablement, quarantine removal, or another shell security bypass. Because Apple has not signed or notarized this beta, if macOS blocks first launch, use the one-time **System Settings → Privacy & Security → Open Anyway** path for Kopper. Record whether the launch was direct or needed that documented action.

## Evidence rules

Record the draft release URL and workflow URL, then the published release URL when applicable; also record the exact tag, version, full commit SHA, tester, physical Mac model, architecture, macOS product/build version, and UTC start/end bounds. For every command, retain the command, exit status, UTC time, and at most 20 relevant output lines. Redact account names and home-directory prefixes; never include credentials, environment dumps, complete logs, or note contents beyond the inert fixture below. Preserve every failure and append retests rather than replacing observations.

Confirm the operating system before each account's relevant procedure:

```bash
bash <<'BASH'
set -euo pipefail
sw_vers
BASH
```

## Pre-promotion draft acceptance

Run this exact procedure in the first clean account. It downloads the five exact draft assets, verifies both architecture packages, but deliberately does **not** run the draft `install.sh`: its fixed `releases/latest` origin cannot address an unpublished draft. The temporary cleanup trap accepts only the two `mktemp` paths with the expected bounded prefixes and never removes a mounted directory.

```bash
bash <<'BASH'
set -euo pipefail

TAG="v0.1.8"
VERSION="${TAG#v}"
MACHINE_ARCHITECTURE="$(uname -m)"
case "$MACHINE_ARCHITECTURE" in
  arm64) ASSET_ARCHITECTURE="arm64"; EXPECTED_BINARY_ARCHITECTURE="arm64" ;;
  x86_64) ASSET_ARCHITECTURE="x64"; EXPECTED_BINARY_ARCHITECTURE="x86_64" ;;
  *) echo "Unsupported Mac architecture." >&2; exit 1 ;;
esac
TEMP_ROOT="${TMPDIR:-/tmp}"
TEMP_ROOT="${TEMP_ROOT%/}"
test -d "$TEMP_ROOT"
ASSET_DIRECTORY=""
MOUNT_POINT=""
mounted=0
cleanup() {
  cleanup_status=$?
  trap - EXIT HUP INT TERM
  if [[ -n "$MOUNT_POINT" && "$mounted" = "1" ]]; then
    if hdiutil detach "$MOUNT_POINT"; then
      mounted=0
    else
      echo "Cleanup could not detach the validated mount; preserving both temporary paths." >&2
    fi
  fi
  if [[ "$mounted" = "0" ]]; then
    case "$MOUNT_POINT" in
      "$TEMP_ROOT"/kopper-mount.*)
        if [[ -d "$MOUNT_POINT" ]]; then
          rmdir -- "$MOUNT_POINT" 2>/dev/null || true
        fi
        ;;
      "") ;;
      *) echo "Cleanup preserved an unexpected mount path." >&2 ;;
    esac
    if [[ -d "$ASSET_DIRECTORY" ]]; then
      rm -rf -- "$ASSET_DIRECTORY"
    fi
  fi
  exit "$cleanup_status"
}

ASSET_DIRECTORY="$(mktemp -d "$TEMP_ROOT/kopper-draft.XXXXXX")"
case "$ASSET_DIRECTORY" in
  "$TEMP_ROOT"/kopper-draft.*) ;;
  *) echo "Unexpected draft asset path." >&2; exit 1 ;;
esac
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

MOUNT_POINT="$(mktemp -d "$TEMP_ROOT/kopper-mount.XXXXXX")"
case "$MOUNT_POINT" in
  "$TEMP_ROOT"/kopper-mount.*) ;;
  *) echo "Unexpected mount path." >&2; exit 1 ;;
esac
STORE="$HOME/Library/Application Support/Kopper/kopper.json"
TARGET="$HOME/Applications/Kopper.app"

test ! -e "$STORE"
test ! -e "$TARGET"

gh release download "$TAG" --repo idandwon/kopper --dir "$ASSET_DIRECTORY"
asset_entries=()
while IFS= read -r -d '' asset_entry; do
  asset_entries+=("$asset_entry")
done < <(find "$ASSET_DIRECTORY" -mindepth 1 -maxdepth 1 -print0)
test "${#asset_entries[@]}" -eq 5
ARM64_DMG="$ASSET_DIRECTORY/Kopper-${VERSION}-arm64.dmg"
ARM64_CHECKSUM="$ASSET_DIRECTORY/Kopper-${VERSION}-arm64.dmg.sha256"
X64_DMG="$ASSET_DIRECTORY/Kopper-${VERSION}-x64.dmg"
X64_CHECKSUM="$ASSET_DIRECTORY/Kopper-${VERSION}-x64.dmg.sha256"
INSTALLER="$ASSET_DIRECTORY/install.sh"
for asset in "$ARM64_DMG" "$ARM64_CHECKSUM" "$X64_DMG" "$X64_CHECKSUM" "$INSTALLER"; do
  test -f "$asset"
  test ! -L "$asset"
done
bash -n "$INSTALLER"
for architecture in arm64 x64; do
  case "$architecture" in
    arm64) checksum="$ARM64_CHECKSUM" ;;
    x64) checksum="$X64_CHECKSUM" ;;
  esac
  checksum_line="$(cat "$checksum")"
  checksum_pattern="^[0-9a-f]{64}[[:space:]][[:space:]]Kopper-${VERSION}-${architecture}.dmg$"
  [[ "$checksum_line" =~ $checksum_pattern ]]
  (cd "$ASSET_DIRECTORY" && shasum -a 256 -c "${checksum##*/}")
done

mkdir -p "$(dirname "$STORE")" "$HOME/Applications"
printf '%s\n' '{"schemaVersion":1,"notes":[]}' > "$STORE"
STORE_BEFORE="$(shasum -a 256 "$STORE" | awk '{print $1}')"
assert_exact_architecture() {
  binary="$1"
  expected_architecture="$2"
  architecture_set="$(
    lipo -archs "$binary" |
      tr ' ' '\n' |
      sed '/^$/d' |
      sort |
      paste -sd ' ' -
  )"
  test "$architecture_set" = "$expected_architecture"
  printf '%s: %s\n' "$binary" "$architecture_set"
}

for architecture in arm64 x64; do
  case "$architecture" in
    arm64) dmg="$ARM64_DMG"; binary_architecture="arm64" ;;
    x64) dmg="$X64_DMG"; binary_architecture="x86_64" ;;
  esac
  mkdir -p "$MOUNT_POINT"
  hdiutil attach -readonly -nobrowse -mountpoint "$MOUNT_POINT" "$dmg"
  mounted=1
  APP="$MOUNT_POINT/Kopper.app"
  root_apps=()
  while IFS= read -r -d '' root_app; do
    root_apps+=("$root_app")
  done < <(find "$MOUNT_POINT" -mindepth 1 -maxdepth 1 -name '*.app' -print0)
  test "${#root_apps[@]}" -eq 1
  test "${root_apps[0]}" = "$APP"
  test -d "$APP"
  test ! -L "$APP"
  test "$(plutil -extract CFBundleIdentifier raw -o - "$APP/Contents/Info.plist")" = "com.kopper.app"
  test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = "$VERSION"
  test "$(plutil -extract LSMinimumSystemVersion raw -o - "$APP/Contents/Info.plist")" = "14.0"
  assert_exact_architecture "$APP/Contents/MacOS/Kopper" "$binary_architecture"
  assert_exact_architecture "$APP/Contents/Resources/app.asar.unpacked/node_modules/uiohook-napi/build/Release/uiohook_napi.node" "$binary_architecture"
  if [[ "$architecture" = "$ASSET_ARCHITECTURE" ]]; then
    ditto "$APP" "$TARGET"
  fi
  hdiutil detach "$MOUNT_POINT"
  mounted=0
done
test ! -e "$MOUNT_POINT" || rmdir -- "$MOUNT_POINT"
test "$(shasum -a 256 "$STORE" | awk '{print $1}')" = "$STORE_BEFORE"
if open "$TARGET"; then
  launch_status=0
else
  launch_status=$?
fi
printf 'Initial open command exit status: %s\n' "$launch_status"
BASH
```

The architecture assertions must print exactly `arm64` for the arm64 DMG and `x86_64` for the x64 DMG. The matching build is copied for the physical launch check. The `open` status is evidence, but even status 0 does not prove the visible Gatekeeper result. Complete the observation through Finder: open `~/Applications/Kopper.app`; if macOS blocks it, open **System Settings → Privacy & Security** and choose **Open Anyway** once for Kopper. Record the direct or Open Anyway result and never use a shell security bypass.

The trap removes only the validated temporary paths after detaching the image. It intentionally keeps the clean-account `TARGET` and inert store for the manual observation. After evidence capture, remove only that exact target. Never remove the store unless the tester created it solely as this inert fixture and records that cleanup.

## Post-publication canonical-installer acceptance

After explicit approval promotes the exact draft, use a second clean standard account. This is the first point at which `releases/latest` can resolve the immutable release. The following self-contained block proves the application and store are both absent before creating the inert store fixture, propagates either side of a pipeline failure, records the installer status, and validates the installed bundle:

```bash
bash <<'BASH'
set -euo pipefail

TAG="v0.1.8"
VERSION="${TAG#v}"
MACHINE_ARCHITECTURE="$(uname -m)"
case "$MACHINE_ARCHITECTURE" in
  arm64) ASSET_ARCHITECTURE="arm64"; EXPECTED_BINARY_ARCHITECTURE="arm64" ;;
  x86_64) ASSET_ARCHITECTURE="x64"; EXPECTED_BINARY_ARCHITECTURE="x86_64" ;;
  *) echo "Unsupported Mac architecture." >&2; exit 1 ;;
esac
STORE="$HOME/Library/Application Support/Kopper/kopper.json"
APP="$HOME/Applications/Kopper.app"
test ! -e "$STORE"
test ! -e "$APP"
mkdir -p "$(dirname "$STORE")"
printf '%s\n' '{"schemaVersion":1,"notes":[]}' > "$STORE"
STORE_BEFORE="$(shasum -a 256 "$STORE" | awk '{print $1}')"
if curl -fsSL https://github.com/idandwon/kopper/releases/latest/download/install.sh | bash; then
  install_status=0
else
  install_status=$?
fi
printf 'Canonical installer exit status: %s\n' "$install_status"
test "$install_status" -eq 0
test -d "$APP"
test ! -L "$APP"
test "$(plutil -extract CFBundleIdentifier raw -o - "$APP/Contents/Info.plist")" = "com.kopper.app"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = "$VERSION"
test "$(plutil -extract LSMinimumSystemVersion raw -o - "$APP/Contents/Info.plist")" = "14.0"
test "$(shasum -a 256 "$STORE" | awk '{print $1}')" = "$STORE_BEFORE"

assert_exact_architecture() {
  binary="$1"
  architecture_set="$(
    lipo -archs "$binary" |
      tr ' ' '\n' |
      sed '/^$/d' |
      sort |
      paste -sd ' ' -
  )"
  test "$architecture_set" = "$EXPECTED_BINARY_ARCHITECTURE"
  printf '%s: %s\n' "$binary" "$architecture_set"
}
assert_exact_architecture "$APP/Contents/MacOS/Kopper"
assert_exact_architecture "$APP/Contents/Resources/app.asar.unpacked/node_modules/uiohook-napi/build/Release/uiohook_napi.node"
BASH
```

The canonical installer must leave no exact versioned Kopper DMG mounted and no staging or rollback artifact. This structured check examines every `hdiutil` image before it bounds reported matches; its trap removes only the validated `mktemp` directory:

```bash
bash <<'BASH'
set -euo pipefail

TAG="v0.1.8"
VERSION="${TAG#v}"
case "$(uname -m)" in
  arm64) ASSET_ARCHITECTURE="arm64" ;;
  x86_64) ASSET_ARCHITECTURE="x64" ;;
  *) echo "Unsupported Mac architecture." >&2; exit 1 ;;
esac
EXPECTED_DMG="Kopper-${VERSION}-${ASSET_ARCHITECTURE}.dmg"
TEMP_ROOT="${TMPDIR:-/tmp}"
TEMP_ROOT="${TEMP_ROOT%/}"
test -d "$TEMP_ROOT"
MOUNT_CHECK_DIRECTORY=""
cleanup_mount_check() {
  cleanup_status=$?
  trap - EXIT HUP INT TERM
  if [[ -d "$MOUNT_CHECK_DIRECTORY" ]]; then
    rm -rf -- "$MOUNT_CHECK_DIRECTORY"
  fi
  exit "$cleanup_status"
}

MOUNT_CHECK_DIRECTORY="$(mktemp -d "$TEMP_ROOT/kopper-mount-check.XXXXXX")"
case "$MOUNT_CHECK_DIRECTORY" in
  "$TEMP_ROOT"/kopper-mount-check.*) ;;
  *) echo "Unexpected mount-check path." >&2; exit 1 ;;
esac
trap cleanup_mount_check EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

MOUNT_CHECK_SCRIPT="$MOUNT_CHECK_DIRECTORY/check-kopper-mounts.js"
MOUNT_STATE_PLIST="$MOUNT_CHECK_DIRECTORY/hdiutil-info.plist"
MOUNT_STATE_JSON="$MOUNT_CHECK_DIRECTORY/hdiutil-info.json"
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
if /usr/bin/osascript -l JavaScript "$MOUNT_CHECK_SCRIPT" "$MOUNT_STATE_JSON" "$EXPECTED_DMG"; then
  mount_check_status=0
else
  mount_check_status=$?
fi
printf 'Structured mount check exit status: %s\n' "$mount_check_status"
test "$mount_check_status" -eq 0
installer_artifacts=()
while IFS= read -r -d '' installer_artifact; do
  installer_artifacts+=("$installer_artifact")
done < <(
  find "$HOME/Applications" -maxdepth 1 \
    \( -name '.Kopper.app.install.*' -o -name '.Kopper.app.rollback.*' \) \
    -print0
)
test "${#installer_artifacts[@]}" -eq 0
BASH
```

Launch Kopper and, while it is running, execute this refusal block. It records the expected nonzero pipeline status, proves the application bytes did not change, and uses only a validated temporary snapshot directory:

```bash
bash <<'BASH'
set -euo pipefail

APP="$HOME/Applications/Kopper.app"
test -d "$APP"
test ! -L "$APP"
TEMP_ROOT="${TMPDIR:-/tmp}"
TEMP_ROOT="${TEMP_ROOT%/}"
test -d "$TEMP_ROOT"
SNAPSHOT_DIRECTORY=""
cleanup_snapshot() {
  cleanup_status=$?
  trap - EXIT HUP INT TERM
  if [[ -d "$SNAPSHOT_DIRECTORY" ]]; then
    rm -rf -- "$SNAPSHOT_DIRECTORY"
  fi
  exit "$cleanup_status"
}

SNAPSHOT_DIRECTORY="$(mktemp -d "$TEMP_ROOT/kopper-running-refusal.XXXXXX")"
case "$SNAPSHOT_DIRECTORY" in
  "$TEMP_ROOT"/kopper-running-refusal.*) ;;
  *) echo "Unexpected refusal snapshot path." >&2; exit 1 ;;
esac
trap cleanup_snapshot EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

SNAPSHOT_APP="$SNAPSHOT_DIRECTORY/Kopper.app"
DIFF_OUTPUT="$SNAPSHOT_DIRECTORY/app.diff"
ditto "$APP" "$SNAPSHOT_APP"
if curl -fsSL https://github.com/idandwon/kopper/releases/latest/download/install.sh | bash; then
  running_install_status=0
else
  running_install_status=$?
fi
printf 'Running-process installer exit status: %s\n' "$running_install_status"
test "$running_install_status" -ne 0
if diff -qr "$SNAPSHOT_APP" "$APP" > "$DIFF_OUTPUT"; then
  diff_status=0
else
  diff_status=$?
fi
sed -n '1,20p' "$DIFF_OUTPUT"
test "$diff_status" -eq 0
BASH
```

Quit Kopper, then execute the successful upgrade as a separate self-contained block. It records and asserts the expected zero status and preserves the inert store hash:

```bash
bash <<'BASH'
set -euo pipefail

APP="$HOME/Applications/Kopper.app"
STORE="$HOME/Library/Application Support/Kopper/kopper.json"
test -d "$APP"
test ! -L "$APP"
test -f "$STORE"
STORE_BEFORE="$(shasum -a 256 "$STORE" | awk '{print $1}')"
if curl -fsSL https://github.com/idandwon/kopper/releases/latest/download/install.sh | bash; then
  upgrade_status=0
else
  upgrade_status=$?
fi
printf 'Post-quit installer exit status: %s\n' "$upgrade_status"
test "$upgrade_status" -eq 0
test -d "$APP"
test ! -L "$APP"
test "$(shasum -a 256 "$STORE" | awk '{print $1}')" = "$STORE_BEFORE"
BASH
```

If the installed app is blocked on first launch, use the documented **Open Anyway** action once; do not use a shell security bypass. Retain the printed initial-launch, canonical-install, structured-mount, running-refusal, and post-quit statuses in the bounded evidence.

## Required observations

| ID | Required observation |
| --- | --- |
| UNSIGNED-01 | The exact draft contains only the versioned arm64 and x64 DMGs, their matching SHA-256 files, and the tagged `install.sh`; both checksum verifications succeed. |
| UNSIGNED-02 | Each root-level real `Kopper.app` reports the exact version, bundle identifier `com.kopper.app`, minimum macOS `14.0`, and only the runtime architecture declared by its DMG filename. |
| UNSIGNED-03 | A manual draft installation to `~/Applications/Kopper.app` preserves the inert `kopper.json` hash and first launch either opens directly or succeeds after one System Settings → Privacy & Security → Open Anyway approval; no shell security bypass is used. |
| UNSIGNED-04 | After publication, the canonical installer leaves exactly `~/Applications/Kopper.app`, no mounted Kopper DMG, and no `.Kopper.app.install.*` or `.Kopper.app.rollback.*` artifact. |
| UNSIGNED-05 | After publication, the explicitly recorded nonzero running-process refusal and subsequent zero-status quit-and-upgrade preserve the app transaction and inert `kopper.json` SHA-256. |
| UNSIGNED-06 | After immutable publication, the canonical curl command exits 0 on a second clean macOS 14+ standard account and prints the unsigned-beta approval guidance. |
