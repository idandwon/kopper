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

temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/kopper-install.XXXXXX")"
trap 'rm -rf "$temporary_directory"' EXIT
