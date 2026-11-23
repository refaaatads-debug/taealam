#!/bin/sh
# PREPARATION ONLY. No automatic install, restart, database or key mutation.
set -eu
if [ "${1:-}" = --rehearse ]; then
  root=$(mktemp -d)
  trap 'rm -rf "$root"' EXIT
  printf 'previous web and functions\n' > "$root/before"
  cp "$root/before" "$root/backup"
  printf 'pilot candidate\n' > "$root/before"
  cp "$root/backup" "$root/before"
  cmp "$root/backup" "$root/before"
  printf '%s\n' 'FILE_RESTORE_REHEARSAL_PASS (not a production rollback test)'
  exit 0
fi
cat <<'PLAN'
NOT EXECUTED. Exact rollback must be generated against the approved release backup:
1. Disable Gemini issuance first; never issue both providers concurrently.
2. Wait until all minted ephemeral tokens expire (at least 5 minutes plus margin).
3. Preserve the shared daily ledger, all reservations, and usage evidence. Never refund from client claims.
4. Restore the captured pre-release function/web files, not today's old shared-voice rollback indiscriminately.
5. Restart only changed services; bounded readiness check; compare saved hashes.
6. Restore previous provider routing only after explicit approval. ElevenLabs credits may still be exhausted.
7. Do not replace/revoke the shared Gemini key; Sanad and existing features depend on it.
8. If a later native mobile build is involved, server-disable its Gemini path first. No silent OTA or store release.
PLAN
