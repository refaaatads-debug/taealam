#!/bin/sh
# PREPARED ONLY. Run after owner publishing approval and successful cutoff proof.
set -eu
base=/root/backups/shared-voice-cap-20261123
root=/root/taealam/supabase_setup/docker/volumes/functions
stage=/root/shared-voice-cap-stage
# Archive and this script must arrive through a private root-only path.
test ! -e "$base"
test -d "$stage/supabase/functions"
python3 -c 'import json; c=json.load(open("/root/shared-voice-cap-stage/supabase/functions/_shared/live-voice-cap-config.json")); assert c["enabled"] is True and c["versionId"]'
mkdir -m700 "$base"
# Full database backup, plus exact scoped file copies, BEFORE mutations.
docker exec supabase-db pg_dump -U postgres -d postgres -Fc > "$base/database-before.dump"
test -s "$base/database-before.dump"
mkdir -m700 "$base/files"
for f in ai-tutor-token/index.ts ai-tutor-chat/index.ts _shared/live-voice-daily-preview.ts _shared/tts-daily-budget-preview.ts _shared/premium-voice.ts _shared/live-voice-cap-config.ts _shared/live-voice-cap-config.json; do
 mkdir -p "$base/files/$(dirname "$f")"
 if test -f "$root/$f"; then cp -a "$root/$f" "$base/files/$f"; else printf '%s\n' "$f" >> "$base/absent-files"; fi
done
if test -f /etc/cron.d/shared-voice-cap; then cp -a /etc/cron.d/shared-voice-cap "$base/cron-before"; fi
cat > "$base/rollback.sh" <<'ROLLBACK'
#!/bin/sh
set -eu
base=/root/backups/shared-voice-cap-20261123
root=/root/taealam/supabase_setup/docker/volumes/functions
rm -f /etc/cron.d/shared-voice-cap
cp -a "$base/files/." "$root/"
if test -f "$base/absent-files"; then while IFS= read -r f; do rm -f "$root/$f"; done < "$base/absent-files"; fi
if test -f "$base/cron-before"; then cp -a "$base/cron-before" /etc/cron.d/shared-voice-cap; fi
docker restart supabase-edge-functions
# Deliberately keep RLS-locked usage tables as an audit ledger. Do not erase usage.
# Production default provider version was never switched, so no provider rollback.
ROLLBACK
chmod 700 "$base/rollback.sh"
trap 'status=$?; trap - EXIT; if [ "$status" -ne 0 ]; then sh "$base/rollback.sh"; fi; exit "$status"' EXIT
# Validate schema migration against local staging before this script is authorized.
docker exec -i supabase-db psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$stage/supabase/migrations/20261123_live_voice_daily_preview.sql"
for f in ai-tutor-token/index.ts ai-tutor-chat/index.ts _shared/live-voice-daily-preview.ts _shared/tts-daily-budget-preview.ts _shared/premium-voice.ts _shared/live-voice-cap-config.ts _shared/live-voice-cap-config.json; do cp -a "$stage/supabase/functions/$f" "$root/$f"; done
# Release config must be changed in committed source to the proved exact version.
# Stop here if disabled: never silently enable a mutable/default agent version.
python3 -c 'import json; c=json.load(open("/root/taealam/supabase_setup/docker/volumes/functions/_shared/live-voice-cap-config.json")); assert c["enabled"] is True and c["versionId"]'
install -m700 "$stage/scripts/voice-cap-reconcile.py" "$base/reconcile.py"
printf '%s\n' '* * * * * root /usr/bin/flock -n /run/shared-voice-cap.lock /usr/bin/timeout 55 /usr/bin/python3 /root/backups/shared-voice-cap-20261123/reconcile.py >> /root/backups/shared-voice-cap-20261123/reconcile.log 2>&1' > /etc/cron.d/shared-voice-cap
chmod 644 /etc/cron.d/shared-voice-cap
docker restart supabase-edge-functions
# Follow with nonchargeable auth/deny/entitlement checks, hashes, health probes,
# exact schema+function+RLS permissions and cron reconciliation verification.
