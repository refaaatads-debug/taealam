#!/usr/bin/env bash
# Prepared only. Run on production only after explicit backup/release authorization.
set -euo pipefail
umask 077
: "${APPROVED_RELEASE:?Set the approved immutable release identifier}"
[[ "$APPROVED_RELEASE" =~ ^[a-zA-Z0-9_-]{7,100}$ ]] || exit 2
backup="/root/backups/reconcile-$APPROVED_RELEASE"
api=/opt/ajyal-api-github
web=/var/www/html
functions=/root/taealam/supabase_setup/docker/volumes/functions
# Reject a repeat rather than accidentally replacing the last good snapshot.
test ! -e "$backup"
test -s "$web/index.html"
test -s "$api/artifacts/api-server/dist/index.mjs"
test -d "$api/node_modules"
test -d "$functions"
mkdir -m 700 "$backup"
# No DB changes are included in this release. This is an emergency recovery dump,
# not permission to restore the database or discard post-backup user activity.
docker exec -u postgres supabase-db pg_dump -U postgres -d postgres -Fc --no-owner --no-acl > "$backup/postgres.dump"
test -s "$backup/postgres.dump"
docker exec -i -u postgres supabase-db pg_restore --list < "$backup/postgres.dump" > "$backup/postgres.contents"
tar -czpf "$backup/frontend.tar.gz" -C /var/www html
tar -czpf "$backup/functions.tar.gz" -C /root/taealam/supabase_setup/docker/volumes functions
# Include pnpm's root store and workspace export sources: dist alone is insufficient.
# Do not include uploads, customer data or cache directories in the restore set.
tar -czpf "$backup/api-runtime.tar.gz" -C "$api" artifacts/api-server/dist artifacts/api-server/src artifacts/api-server/package.json artifacts/api-server/node_modules node_modules lib package.json pnpm-lock.yaml pnpm-workspace.yaml
systemctl cat ajyal-api > "$backup/ajyal-api.service.txt"
cp -a "$api/.env" "$backup/api.env"
sha256sum "$web/index.html" "$api/artifacts/api-server/dist/index.mjs" > "$backup/live-artifacts.sha256"
for file in frontend functions api-runtime; do tar -tzf "$backup/$file.tar.gz" > "$backup/$file.contents"; done
(cd "$backup"; sha256sum *.tar.gz postgres.dump api.env ajyal-api.service.txt > SHA256SUMS; sha256sum -c SHA256SUMS)
date -u +%FT%TZ > "$backup/created-at-utc"
printf '%s\n' "$APPROVED_RELEASE" > "$backup/release-id"
printf 'Prepared backup created. Verify off-host recovery and rehearsal before apply: %s\n' "$backup"
