#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo 'Usage: run-electron-with-openbox.sh <command> [args...]' >&2
  exit 2
fi

if [[ -z "${DISPLAY:-}" ]]; then
  echo 'DISPLAY must point to an X server before starting Openbox.' >&2
  exit 2
fi

wm_log="${RUNNER_TEMP:-/tmp}/mixjam-openbox.log"
openbox --sm-disable >"$wm_log" 2>&1 &
wm_pid=$!

cleanup() {
  kill "$wm_pid" 2>/dev/null || true
  wait "$wm_pid" 2>/dev/null || true
}
trap cleanup EXIT

for ((attempt = 0; attempt < 50; attempt += 1)); do
  if xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -q 'window id'; then
    "$@"
    exit
  fi

  if ! kill -0 "$wm_pid" 2>/dev/null; then
    echo 'Openbox exited before registering as the X11 window manager.' >&2
    cat "$wm_log" >&2
    exit 1
  fi

  sleep 0.1
done

echo 'Openbox did not register as the X11 window manager within five seconds.' >&2
cat "$wm_log" >&2
exit 1
