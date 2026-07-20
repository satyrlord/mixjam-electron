#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo 'Usage: run-linux-appimage-smoke.sh <command> [args...]' >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
package_dir="$repo_root/dist-electron"
evidence_dir="$repo_root/tmp/package-smoke/linux"

mapfile -t app_images < <(find "$package_dir" -maxdepth 1 -type f -name '*.AppImage' -print | sort)
if [[ ${#app_images[@]} -ne 1 ]]; then
  printf 'Expected exactly one AppImage in %s; found %s.\n' "$package_dir" "${#app_images[@]}" >&2
  printf '%s\n' "${app_images[@]:-}" >&2
  exit 1
fi
app_image="${app_images[0]}"
mkdir -p "$evidence_dir"
chmod u+x "$app_image"
{
  uname -a
  uname -m
  printf 'artifact=%s\n' "$app_image"
  printf 'resolved_artifact=%s\n' "$(realpath "$app_image")"
  sha256sum "$app_image"
  file "$app_image"
  stat --format='mode=%a size=%s modified=%y' "$app_image"
} >"$evidence_dir/metadata.txt"

export MIXJAM_PACKAGED_EXECUTABLE="$(realpath "$app_image")"
unset MIXJAM_ELECTRON_NO_SANDBOX
printf 'smoke_launch_path=%s\n' "$MIXJAM_PACKAGED_EXECUTABLE" >>"$evidence_dir/metadata.txt"
"$@"
