#!/bin/bash
# Daily backup of Supabase storage files (uploads, recordings). Keeps 7 days.
set -e
SRC=/root/taealam/supabase_setup/docker/volumes/storage
DEST=/root/backups/storage
mkdir -p "$DEST"
OUT="$DEST/storage_$(date +%Y%m%d_%H%M%S).tar.gz"
tar -czf "$OUT" -C "$SRC" .
find "$DEST" -name 'storage_*.tar.gz' -mtime +7 -delete
echo "storage backup ok: $OUT $(du -h "$OUT" | cut -f1)"
