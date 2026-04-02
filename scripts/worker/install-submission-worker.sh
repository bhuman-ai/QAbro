#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

APP_USER="${APP_USER:-qabro}"
APP_GROUP="${APP_GROUP:-qabro}"
APP_ROOT="${APP_ROOT:-/opt/qabro}"
NODE_BIN="${NODE_BIN:-/usr/bin/node}"
INTERVAL_MS="${INTERVAL_MS:-10000}"
SERVICE_NAME="${SERVICE_NAME:-qabro-submission-worker}"

if [[ ! -x "${NODE_BIN}" ]]; then
  echo "Node binary not found at ${NODE_BIN}." >&2
  exit 1
fi

if [[ ! -d "${APP_ROOT}" ]]; then
  echo "App root not found: ${APP_ROOT}" >&2
  exit 1
fi

cat >/etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=QAbro Submission Worker
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${APP_ROOT}
EnvironmentFile=-${APP_ROOT}/.env.worker
EnvironmentFile=-${APP_ROOT}/.env.local
ExecStart=${NODE_BIN} ${APP_ROOT}/scripts/submission-worker.js --interval-ms ${INTERVAL_MS}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now ${SERVICE_NAME}.service

echo "Submission worker installed."
echo "Service: ${SERVICE_NAME}.service"
echo "Working directory: ${APP_ROOT}"
echo "Interval: ${INTERVAL_MS}ms"
