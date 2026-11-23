#!/bin/sh
# Prepared retry only. Needs fresh owner retry approval, no paid calls.
set -eu
base=/root/backups/shared-voice-cap-20261123
root=/root/taealam/supabase_setup/docker/volumes/functions
stage=/root/shared-voice-cap-stage
web=/var/www/html
test -s "$base/rollback-tested"
test -s "$base/database-before.dump"
test ! -e "$base/retry-started"
# Confirm rollback is still exact before touching anything.
for f in ai-tutor-token/index.ts ai-tutor-chat/index.ts _shared/premium-voice.ts; do cmp "$base/files/$f" "$root/$f"; done
python3 - <<'PY'
import pathlib,tarfile,subprocess,json
b=pathlib.Path('/root/backups/shared-voice-cap-20261123')
with tarfile.open(b/'web-before.tar.gz') as t:assert t.extractfile('./index.html').read()==pathlib.Path('/var/www/html/index.html').read_bytes()
q="SELECT json_build_object('days',(SELECT count(*) FROM live_voice_days),'holds',(SELECT count(*) FROM live_voice_reservations),'tables',(SELECT count(*) FROM pg_class WHERE relname IN ('live_voice_days','live_voice_reservations') AND relrowsecurity),'cap300',(SELECT position('n+hold>300' in pg_get_functiondef('reserve_live_voice(uuid,text)'::regprocedure))>0))"
d=json.loads(subprocess.check_output(['docker','exec','supabase-db','psql','-X','-U','postgres','-d','postgres','-Atc',q],text=True));assert d=={'days':0,'holds':0,'tables':2,'cap300':True},d
PY
# Backup already validated; also snapshot the empty postmigration ledger state.
docker exec supabase-db pg_dump -U postgres -d postgres -Fc > "$base/database-before-retry.dump"
docker exec -i supabase-db pg_restore --list < "$base/database-before-retry.dump" > "$base/database-before-retry-list.txt"
# Same source-scoped rollback remains tested. No reapply of the existing migration.
trap 'status=$?; trap - EXIT; if [ "$status" -ne 0 ]; then sh "$base/rollback.sh"; python3 "$stage/scripts/wait-voice-readiness.py"; fi; exit "$status"' EXIT
date -Is > "$base/retry-started"
for f in ai-tutor-token/index.ts ai-tutor-chat/index.ts _shared/live-voice-daily-preview.ts _shared/tts-daily-budget-preview.ts _shared/premium-voice.ts _shared/live-voice-cap-config.ts _shared/live-voice-cap-config.json; do cp -a "$stage/supabase/functions/$f" "$root/$f"; done
install -m700 "$stage/scripts/voice-cap-reconcile.py" "$base/reconcile.py"
printf '%s\n' '* * * * * root /usr/bin/flock -n /run/shared-voice-cap.lock /usr/bin/timeout 55 /usr/bin/python3 /root/backups/shared-voice-cap-20261123/reconcile.py >> /root/backups/shared-voice-cap-20261123/reconcile.log 2>&1' > /etc/cron.d/shared-voice-cap
chmod 644 /etc/cron.d/shared-voice-cap
docker restart supabase-edge-functions
python3 "$stage/scripts/wait-voice-readiness.py"
# Run free backend checks BEFORE exposing changed SPA.
python3 "$stage/scripts/verify-shared-voice-release.py" --backend-only > "$base/retry-backend-verification.log"
cp -a "$stage/dist/assets/." "$web/assets/"
cp -a "$stage/dist/index.html" "$web/index.html"
nginx -t && systemctl reload nginx
(cd "$web"; sha256sum -c "$base/unrelated-web.sha256") > "$base/retry-unrelated-web-check.log"
python3 "$stage/scripts/verify-shared-voice-release.py" > "$base/retry-verification.log"
cat "$base/retry-verification.log"
python3 "$base/reconcile.py" > "$base/reconcile-first.log"
cat "$base/reconcile-first.log"
sha256sum "$web/index.html" "$root/ai-tutor-token/index.ts" "$root/ai-tutor-chat/index.ts" > "$base/deployed.sha256"
cat "$stage/release-commit.txt" > "$base/deployed-commit.txt"
echo RELEASE_VERIFIED
