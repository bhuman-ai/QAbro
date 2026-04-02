#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

WORKER_HOST="${1:-}"
LIVE_STREAM_PASSWORD="${2:-}"
APP_USER="${APP_USER:-qabro}"
APP_GROUP="${APP_GROUP:-qabro}"
APP_ROOT="${APP_ROOT:-/opt/qabro}"
PASSFILE="${PASSFILE:-${APP_ROOT}/.x11vnc.pass}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-}"

if [[ -z "${WORKER_HOST}" ]]; then
  echo "Usage: $0 <public-hostname> <vnc-password>" >&2
  exit 1
fi

if [[ -z "${LIVE_STREAM_PASSWORD}" ]]; then
  echo "A VNC password is required." >&2
  exit 1
fi

if [[ -z "${PUBLIC_BASE_URL}" ]]; then
  PUBLIC_BASE_URL="https://${WORKER_HOST}"
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y xvfb fluxbox x11vnc novnc websockify caddy

x11vnc -storepasswd "${LIVE_STREAM_PASSWORD}" "${PASSFILE}" >/dev/null
chmod 600 "${PASSFILE}"
chown "${APP_USER}:${APP_GROUP}" "${PASSFILE}"

install -D -m 0755 "${APP_ROOT}/scripts/worker/start-live-desktop.sh" /usr/local/bin/qabro-start-live-desktop.sh

cat >/etc/systemd/system/qabro-live-session.service <<EOF
[Unit]
Description=QAbro Live Browser Session
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${APP_ROOT}
Environment=DISPLAY=:99
Environment=QA_LIVE_STREAM_PASSFILE=${PASSFILE}
Environment=QA_LIVE_STREAM_RUNTIME_DIR=/tmp/qabro-live-stream
ExecStart=/usr/local/bin/qabro-start-live-desktop.sh
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/caddy/Caddyfile <<EOF
https://${WORKER_HOST} {
  encode gzip zstd

  header {
    -X-Frame-Options
    Content-Security-Policy "frame-ancestors https://swarmtester.com https://www.swarmtester.com https://qaswarm.dev https://www.qaswarm.dev"
  }

  handle_path /artifacts/* {
    root * ${APP_ROOT}/output
    file_server
  }

  reverse_proxy 127.0.0.1:6080
}
EOF

systemctl daemon-reload
systemctl enable --now qabro-live-session.service
systemctl enable --now caddy.service

python3 - <<'PY' "${APP_ROOT}/.env.worker" "${PUBLIC_BASE_URL}" "${LIVE_STREAM_PASSWORD}"
import sys
from pathlib import Path

env_path = Path(sys.argv[1])
public_base_url = sys.argv[2]
password = sys.argv[3]

updates = {
    "DISPLAY": ":99",
    "QA_LOCAL_HEADLESS": "false",
    "QA_LIVE_STREAM_ENABLED": "true",
    "QA_LIVE_STREAM_PUBLIC_BASE_URL": public_base_url,
    "QA_LIVE_STREAM_PASSWORD": password,
}

lines = []
seen = set()
if env_path.exists():
    lines = env_path.read_text().splitlines()

result = []
for line in lines:
    if "=" not in line or line.lstrip().startswith("#"):
      result.append(line)
      continue
    key = line.split("=", 1)[0]
    if key in updates:
      result.append(f"{key}={updates[key]}")
      seen.add(key)
    else:
      result.append(line)

for key, value in updates.items():
    if key not in seen:
      result.append(f"{key}={value}")

env_path.write_text("\n".join(result).rstrip() + "\n")
PY

systemctl restart qabro-qa-worker.service

echo "Live streaming installed."
echo "Public base URL: ${PUBLIC_BASE_URL}"
