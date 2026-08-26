#!/bin/bash
set -euo pipefail

readonly KOPPER_REPOSITORY="idandwon/kopper"
readonly KOPPER_RELEASES_URL="https://github.com/${KOPPER_REPOSITORY}/releases"
readonly KOPPER_INSTALL_DIRECTORY="${HOME}/Applications"
readonly KOPPER_TARGET="${KOPPER_INSTALL_DIRECTORY}/Kopper.app"
readonly KOPPER_BUNDLE_IDENTIFIER="com.kopper.app"

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

[[ "$(uname -s)" == "Darwin" ]] || fail "Kopper requires macOS 14 or newer."
[[ "$(id -u)" != "0" ]] || fail "Do not run the Kopper installer as root or with sudo."

macos_version="$(sw_vers -productVersion)"
[[ "$(version_major "$macos_version")" =~ ^[0-9]+$ ]] || fail "Could not determine the macOS version."
(( $(version_major "$macos_version") >= 14 )) || fail "Kopper requires macOS 14 or newer."

for command_name in curl hdiutil shasum plutil ditto open pgrep mktemp sw_vers; do
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

temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/kopper-install.XXXXXX")"
mount_point="${temporary_directory}/mount"
staged_target=""
rollback_target=""
mounted=0
transaction_phase="unmodified"
transaction_updating=0
signal_pending=0
upgrading=0

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

cleanup_downloads() {
  local cleanup_status=0

  if [[ "$mounted" == "1" ]]; then
    if hdiutil detach "$mount_point" >/dev/null 2>&1; then
      mounted=0
    else
      cleanup_status=1
    fi
  fi

  if [[ "$mounted" == "0" && -n "$temporary_directory" ]]; then
    if rm -rf "$temporary_directory"; then
      temporary_directory=""
    else
      cleanup_status=1
    fi
  fi

  return "$cleanup_status"
}

handle_signal() {
  if [[ "$transaction_updating" == "1" ]]; then
    signal_pending=1
    return 0
  fi

  exit 1
}

begin_transaction_update() {
  transaction_updating=1
}

finish_transaction_update() {
  transaction_updating=0
  if [[ "$signal_pending" == "1" ]]; then
    signal_pending=0
    exit 1
  fi
}

installer_cleanup() {
  local original_status=$?
  local final_status=$original_status
  trap - EXIT HUP INT TERM

  if [[ -n "$staged_target" && -e "$staged_target" ]]; then
    rm -rf "$staged_target" || final_status=1
  fi

  if [[ "$original_status" != "0" && "$transaction_phase" != "committed" ]]; then
    if [[ "$transaction_phase" == "new-installed" && -e "$KOPPER_TARGET" ]]; then
      rm -rf "$KOPPER_TARGET" || final_status=1
    fi

    if [[ -n "$rollback_target" && -e "$rollback_target" ]]; then
      if [[ -e "$KOPPER_TARGET" ]]; then
        final_status=1
      elif mv "$rollback_target" "$KOPPER_TARGET"; then
        rollback_target=""
      else
        final_status=1
      fi
    fi
  fi

  if [[ "$transaction_phase" == "committed" && -n "$rollback_target" && -e "$rollback_target" ]]; then
    if rm -rf "$rollback_target"; then
      rollback_target=""
    else
      final_status=1
    fi
  fi

  if ! cleanup_downloads; then
    printf 'Kopper installer: Could not completely clean up installer files.\n' >&2
    final_status=1
  fi

  exit "$final_status"
}

trap installer_cleanup EXIT
trap handle_signal HUP INT TERM

printf 'Downloading Kopper %s...\n' "$tag"
curl -fL --retry 3 --proto '=https' --tlsv1.2 \
  -o "${temporary_directory}/${dmg_name}" "${asset_base}/${dmg_name}" \
  || fail "Could not download ${dmg_name}."
curl -fL --retry 3 --proto '=https' --tlsv1.2 \
  -o "${temporary_directory}/${checksum_name}" "${asset_base}/${checksum_name}" \
  || fail "Could not download ${checksum_name}."

printf 'Verifying Kopper download and application identity...\n'
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

mkdir -p "$mount_point"
hdiutil attach -readonly -nobrowse -mountpoint "$mount_point" \
  "${temporary_directory}/${dmg_name}" >/dev/null \
  || fail "Could not mount the Kopper disk image."
mounted=1

shopt -s nullglob
mounted_apps=("$mount_point"/*.app)
shopt -u nullglob
[[ "${#mounted_apps[@]}" == "1" ]] \
  || fail "The Kopper disk image does not contain exactly one Kopper.app application."
mounted_app="${mounted_apps[0]}"
[[ "${mounted_app##*/}" == "Kopper.app" ]] \
  || fail "The Kopper disk image does not contain exactly one Kopper.app application."
verify_app_identity "$mounted_app" \
  || fail "The Kopper application on the disk image failed verification."

pgrep -x Kopper >/dev/null 2>&1 &&
  fail "Quit Kopper, then run this command again."

mkdir -p "$KOPPER_INSTALL_DIRECTORY"
staged_target="${KOPPER_INSTALL_DIRECTORY}/.Kopper.app.install.$$"
rollback_target="${KOPPER_INSTALL_DIRECTORY}/.Kopper.app.rollback.$$"
ditto "$mounted_app" "$staged_target" || fail "Could not stage Kopper."
verify_app_identity "$staged_target" || fail "The staged Kopper application failed verification."

if [[ -e "$KOPPER_TARGET" ]]; then
  upgrading=1
  begin_transaction_update
  if mv "$KOPPER_TARGET" "$rollback_target"; then
    transaction_phase="rollback-ready"
  else
    if [[ ! -e "$KOPPER_TARGET" && -e "$rollback_target" ]]; then
      transaction_phase="rollback-ready"
    fi
    finish_transaction_update
    fail "Could not prepare the existing Kopper installation for upgrade."
  fi
  finish_transaction_update
fi

begin_transaction_update
if mv "$staged_target" "$KOPPER_TARGET"; then
  staged_target=""
  transaction_phase="new-installed"
else
  if [[ ! -e "$staged_target" && -e "$KOPPER_TARGET" ]]; then
    staged_target=""
    transaction_phase="new-installed"
  fi
  finish_transaction_update
  fail "Could not install Kopper."
fi
finish_transaction_update

verify_app_identity "$KOPPER_TARGET" || fail "The installed Kopper application failed verification."
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
if [[ "$upgrading" == "1" ]]; then
  printf 'Unsigned updates can leave macOS Accessibility tied to the previous Kopper build.\n'
  printf 'If capture is unavailable, open System Settings → Privacy & Security → Accessibility, remove Kopper with the minus button, add the current Kopper app again, and enable it.\n'
fi
printf 'Kopper is an unsigned friends beta. If macOS blocks the first launch, open System Settings → Privacy & Security → Open Anyway for Kopper.\n'
