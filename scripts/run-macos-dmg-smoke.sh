#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo 'Usage: run-macos-dmg-smoke.sh <command> [args...]' >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
package_dir="$repo_root/dist-electron"
evidence_dir="$repo_root/tmp/package-smoke/macos"
mount_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/mixjam-dmg.XXXXXX")"

shopt -s nullglob
dmgs=("$package_dir"/*.dmg)
if [[ ${#dmgs[@]} -ne 1 ]]; then
  printf 'Expected exactly one DMG in %s; found %s.\n' "$package_dir" "${#dmgs[@]}" >&2
  printf '%s\n' "${dmgs[@]:-}" >&2
  rmdir "$mount_dir"
  exit 1
fi

dmg="${dmgs[0]}"
mkdir -p "$evidence_dir"
{
  uname -a
  uname -m
  printf 'artifact=%s\n' "$dmg"
  shasum -a 256 "$dmg"
  file "$dmg"
  stat -f 'mode=%Lp size=%z modified=%Sm' "$dmg"
  hdiutil verify "$dmg"
} >"$evidence_dir/metadata.txt" 2>&1

mounted=false
cleanup() {
  local status=$?
  if [[ "$mounted" == true ]]; then
    if ! hdiutil detach "$mount_dir" >>"$evidence_dir/detach.txt" 2>&1; then
      hdiutil detach -force "$mount_dir" >>"$evidence_dir/detach.txt" 2>&1 || true
    fi
  fi
  rmdir "$mount_dir" 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT

hdiutil attach "$dmg" -nobrowse -readonly -mountpoint "$mount_dir" >"$evidence_dir/attach.txt" 2>&1
mounted=true
apps=("$mount_dir"/*.app)
if [[ ${#apps[@]} -ne 1 ]]; then
  printf 'Expected exactly one app bundle at the DMG root; found %s.\n' "${#apps[@]}" >&2
  printf '%s\n' "${apps[@]:-}" >&2
  exit 1
fi
app_bundle="${apps[0]}"
app_executable="$app_bundle/Contents/MacOS/MixJam Electron"
if [[ ! -x "$app_executable" ]]; then
  echo "Expected app executable at $app_executable." >&2
  exit 1
fi

{
  printf 'mounted_app=%s\n' "$app_bundle"
  printf 'mounted_executable=%s\n' "$app_executable"
  file "$app_executable"
  plutil -p "$app_bundle/Contents/Info.plist"
  codesign --verify --deep --strict --verbose=2 "$app_bundle" || true
  spctl --assess --type execute --verbose=4 "$app_bundle" || true
} >"$evidence_dir/app-verification.txt" 2>&1

export MIXJAM_PACKAGED_EXECUTABLE="$app_executable"
unset MIXJAM_ELECTRON_NO_SANDBOX
printf 'smoke_launch_path=%s\n' "$MIXJAM_PACKAGED_EXECUTABLE" >>"$evidence_dir/metadata.txt"
"$@"
