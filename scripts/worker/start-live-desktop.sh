#!/usr/bin/env bash
set -euo pipefail

DISPLAY_VALUE="${DISPLAY:-:99}"
SCREEN_GEOMETRY="${QA_LIVE_STREAM_SCREEN_GEOMETRY:-1600x900x24}"
VNC_PORT="${QA_LIVE_STREAM_VNC_PORT:-5900}"
NOVNC_PORT="${QA_LIVE_STREAM_NOVNC_PORT:-6080}"
PASSFILE="${QA_LIVE_STREAM_PASSFILE:-/opt/qabro/.x11vnc.pass}"
RUNTIME_DIR="${QA_LIVE_STREAM_RUNTIME_DIR:-/tmp/qabro-live-stream}"
XVFB_BIN="${XVFB_BIN:-$(command -v Xvfb || true)}"
FLUXBOX_BIN="${FLUXBOX_BIN:-$(command -v fluxbox || true)}"
X11VNC_BIN="${X11VNC_BIN:-$(command -v x11vnc || true)}"
NOVNC_PROXY_BIN="${NOVNC_PROXY_BIN:-$(command -v novnc_proxy || true)}"
NOVNC_WEB_DIR="${QA_LIVE_STREAM_WEB_DIR:-/usr/share/novnc}"

if [[ -z "${XVFB_BIN}" || -z "${FLUXBOX_BIN}" || -z "${X11VNC_BIN}" ]]; then
  echo "Missing required desktop binaries (Xvfb, fluxbox, x11vnc)." >&2
  exit 1
fi

if [[ -z "${NOVNC_PROXY_BIN}" && -x "/usr/share/novnc/utils/novnc_proxy" ]]; then
  NOVNC_PROXY_BIN="/usr/share/novnc/utils/novnc_proxy"
fi

if [[ -z "${NOVNC_PROXY_BIN}" ]]; then
  echo "Missing novnc_proxy binary." >&2
  exit 1
fi

if [[ ! -f "${PASSFILE}" ]]; then
  echo "Missing VNC password file at ${PASSFILE}." >&2
  exit 1
fi

mkdir -p "${RUNTIME_DIR}"

PIDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do
    kill "${pid}" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

DISPLAY_LOCK_FILE="/tmp/.X${DISPLAY_VALUE#:}-lock"
rm -f "${DISPLAY_LOCK_FILE}" "${RUNTIME_DIR}"/xvfb.log "${RUNTIME_DIR}"/fluxbox.log "${RUNTIME_DIR}"/x11vnc.log "${RUNTIME_DIR}"/novnc.log

"${XVFB_BIN}" "${DISPLAY_VALUE}" -screen 0 "${SCREEN_GEOMETRY}" -ac -nolisten tcp >"${RUNTIME_DIR}/xvfb.log" 2>&1 &
PIDS+=("$!")
sleep 1

export DISPLAY="${DISPLAY_VALUE}"
"${FLUXBOX_BIN}" >"${RUNTIME_DIR}/fluxbox.log" 2>&1 &
PIDS+=("$!")
sleep 1

"${X11VNC_BIN}" \
  -display "${DISPLAY_VALUE}" \
  -rfbport "${VNC_PORT}" \
  -localhost \
  -forever \
  -shared \
  -rfbauth "${PASSFILE}" \
  -noxdamage \
  -o "${RUNTIME_DIR}/x11vnc.log" &
PIDS+=("$!")
sleep 1

exec "${NOVNC_PROXY_BIN}" \
  --listen "127.0.0.1:${NOVNC_PORT}" \
  --vnc "127.0.0.1:${VNC_PORT}" \
  --web "${NOVNC_WEB_DIR}" \
  >"${RUNTIME_DIR}/novnc.log" 2>&1
