#!/usr/bin/env bash
# Use the existing workspace secret without printing it or putting it in argv.
set -Eeuo pipefail
: "${VPS_PASSWORD:?Configure VPS_PASSWORD in workspace Secrets}"
exec env SSHPASS="$VPS_PASSWORD" sshpass -e ssh \
  -o PreferredAuthentications=password -o PubkeyAuthentication=no \
  -o StrictHostKeyChecking=accept-new -o LogLevel=ERROR \
  -o ConnectTimeout=20 -p "${VPS_PORT:-22}" \
  "${VPS_USER:-root}@${VPS_HOST:-72.61.23.237}" "${@:-bash -s}"
