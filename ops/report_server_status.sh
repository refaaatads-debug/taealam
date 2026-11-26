#!/bin/bash
# NOT INSTALLED. Preview only. Run on the VPS from cron (e.g. every 30 min) as a user that can use psql.
# Writes one row with disk usage of / and the newest dump in /root/backups.
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
read -r total used < <(df -B1 --output=size,used / | tail -1)
latest=$(ls -t "$BACKUP_DIR"/*.dump 2>/dev/null | head -1 || true)
count=$(ls "$BACKUP_DIR"/*.dump 2>/dev/null | wc -l)
if [ -n "$latest" ]; then
  at=$(date -u -d "@$(stat -c %Y "$latest")" +%FT%TZ); size=$(stat -c %s "$latest")
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "INSERT INTO public.server_status_snapshots (disk_total_bytes,disk_used_bytes,last_backup_at,last_backup_bytes,backup_count) VALUES ($total,$used,'$at',$size,$count);"
else
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "INSERT INTO public.server_status_snapshots (disk_total_bytes,disk_used_bytes,backup_count,note) VALUES ($total,$used,0,'no backups found');"
fi
psql "$DATABASE_URL" -c "DELETE FROM public.server_status_snapshots WHERE created_at < now() - interval '30 days';"
