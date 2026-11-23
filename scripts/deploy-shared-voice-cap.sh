#!/bin/sh
# Approved scoped release only. Build/test source and pin config before running.
set -eu
base=/root/backups/shared-voice-cap-20261123
root=/root/taealam/supabase_setup/docker/volumes/functions
stage=/root/shared-voice-cap-stage
web=/var/www/html
test ! -e "$base"
test -s "$stage/dist/index.html"
python3 -c 'import json; c=json.load(open("/root/shared-voice-cap-stage/supabase/functions/_shared/live-voice-cap-config.json")); assert c["enabled"] is True and c["versionId"]'
mkdir -m700 "$base"
docker exec supabase-db pg_dump -U postgres -d postgres -Fc > "$base/database-before.dump"
test -s "$base/database-before.dump"
docker exec -i supabase-db pg_restore --list < "$base/database-before.dump" > "$base/database-restore-list.txt"
test -s "$base/database-restore-list.txt"
mkdir -m700 "$base/files"
for f in ai-tutor-token/index.ts ai-tutor-chat/index.ts _shared/live-voice-daily-preview.ts _shared/tts-daily-budget-preview.ts _shared/premium-voice.ts _shared/live-voice-cap-config.ts _shared/live-voice-cap-config.json; do
 mkdir -p "$base/files/$(dirname "$f")"
 if test -f "$root/$f"; then cp -a "$root/$f" "$base/files/$f"; else printf '%s\n' "$f" >> "$base/absent-files"; fi
done
if test -f /etc/cron.d/shared-voice-cap; then cp -a /etc/cron.d/shared-voice-cap "$base/cron-before"; fi
tar -czf "$base/web-before.tar.gz" -C "$web" .
# Everything except SPA index/assets must remain byte-identical.
(cd "$web"; find . -type f ! -path './assets/*' ! -path './index.html' -print0 | sort -z | xargs -0 sha256sum) > "$base/unrelated-web.sha256"
cat > "$base/rollback.sh" <<'ROLLBACK'
#!/bin/sh
set -eu
base=${VOICE_ROLLBACK_BASE:-/root/backups/shared-voice-cap-20261123}
root=${VOICE_ROLLBACK_FUNCTIONS:-/root/taealam/supabase_setup/docker/volumes/functions}
web=${VOICE_ROLLBACK_WEB:-/var/www/html}
cron=${VOICE_ROLLBACK_CRON:-/etc/cron.d/shared-voice-cap}
rm -f "$cron"
cp -a "$base/files/." "$root/"
if test -f "$base/absent-files"; then while IFS= read -r f; do rm -f "$root/$f"; done < "$base/absent-files"; fi
if test -f "$base/cron-before"; then cp -a "$base/cron-before" "$cron"; fi
tar -xzf "$base/web-before.tar.gz" -C "$web"
if test "${VOICE_ROLLBACK_REHEARSAL:-0}" != 1; then
 docker restart supabase-edge-functions
 nginx -t && systemctl reload nginx
fi
# Keep RLS-locked usage ledger for audit. Original provider was not modified.
ROLLBACK
chmod 700 "$base/rollback.sh"
sh -n "$base/rollback.sh"
# Rehearse actual rollback against copies, not production, before migration.
mkdir -p "$base/rehearsal/functions" "$base/rehearsal/web"
cp -a "$root/." "$base/rehearsal/functions/"
tar -xzf "$base/web-before.tar.gz" -C "$base/rehearsal/web"
for f in ai-tutor-token/index.ts ai-tutor-chat/index.ts _shared/live-voice-daily-preview.ts _shared/tts-daily-budget-preview.ts _shared/premium-voice.ts _shared/live-voice-cap-config.ts _shared/live-voice-cap-config.json; do cp -a "$stage/supabase/functions/$f" "$base/rehearsal/functions/$f"; done
cp "$stage/dist/index.html" "$base/rehearsal/web/index.html"
VOICE_ROLLBACK_BASE="$base" VOICE_ROLLBACK_FUNCTIONS="$base/rehearsal/functions" VOICE_ROLLBACK_WEB="$base/rehearsal/web" VOICE_ROLLBACK_CRON="$base/rehearsal/cron" VOICE_ROLLBACK_REHEARSAL=1 sh "$base/rollback.sh"
diff -qr "$base/files" "$base/rehearsal/functions" > "$base/rehearsal-diff.txt" || true
for f in ai-tutor-token/index.ts ai-tutor-chat/index.ts _shared/premium-voice.ts; do cmp "$base/files/$f" "$base/rehearsal/functions/$f"; done
if test -f "$base/absent-files"; then while IFS= read -r f; do test ! -e "$base/rehearsal/functions/$f"; done < "$base/absent-files"; fi
cmp "$web/index.html" "$base/rehearsal/web/index.html"
echo ROLLBACK_REHEARSAL_PASS > "$base/rollback-tested"
trap 'status=$?; trap - EXIT; if [ "$status" -ne 0 ]; then sh "$base/rollback.sh"; fi; exit "$status"' EXIT
docker exec -i supabase-db psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$stage/supabase/migrations/20261123_live_voice_daily_preview.sql"
for f in ai-tutor-token/index.ts ai-tutor-chat/index.ts _shared/live-voice-daily-preview.ts _shared/tts-daily-budget-preview.ts _shared/premium-voice.ts _shared/live-voice-cap-config.ts _shared/live-voice-cap-config.json; do cp -a "$stage/supabase/functions/$f" "$root/$f"; done
install -m700 "$stage/scripts/voice-cap-reconcile.py" "$base/reconcile.py"
printf '%s\n' '* * * * * root /usr/bin/flock -n /run/shared-voice-cap.lock /usr/bin/timeout 55 /usr/bin/python3 /root/backups/shared-voice-cap-20261123/reconcile.py >> /root/backups/shared-voice-cap-20261123/reconcile.log 2>&1' > /etc/cron.d/shared-voice-cap
chmod 644 /etc/cron.d/shared-voice-cap
docker restart supabase-edge-functions
python3 "$stage/scripts/wait-voice-readiness.py"
# Add hashed assets, preserve older assets for cached clients/rollback. Index last.
cp -a "$stage/dist/assets/." "$web/assets/"
cp -a "$stage/dist/index.html" "$web/index.html"
nginx -t && systemctl reload nginx
(cd "$web"; sha256sum -c "$base/unrelated-web.sha256") > "$base/unrelated-web-check.log"
python3 "$stage/scripts/verify-shared-voice-release.py" > "$base/verification.log"
cat "$base/verification.log"
python3 "$base/reconcile.py" > "$base/reconcile-first.log"
cat "$base/reconcile-first.log"
sha256sum "$web/index.html" "$root/ai-tutor-token/index.ts" "$root/ai-tutor-chat/index.ts" > "$base/deployed.sha256"
cat "$stage/release-commit.txt" > "$base/deployed-commit.txt"
echo RELEASE_VERIFIED
