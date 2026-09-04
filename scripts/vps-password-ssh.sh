#!/usr/bin/env bash
set -Eeuo pipefail

: "${VPS_PASSWORD:?VPS_PASSWORD must be configured as a Replit Secret}"
VPS_HOST="${VPS_HOST:-72.61.23.237}"
VPS_PORT="${VPS_PORT:-22}"
VPS_USER="${VPS_USER:-root}"

if ! command -v sshpass >/dev/null 2>&1; then
  echo "sshpass is required for VPS password authentication" >&2
  exit 2
fi

env SSHPASS="$VPS_PASSWORD" sshpass -e ssh \
  -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no \
  -o StrictHostKeyChecking=accept-new \
  -o LogLevel=ERROR \
  -p "$VPS_PORT" \
  "$VPS_USER@$VPS_HOST" \
  'whoami; hostname'
