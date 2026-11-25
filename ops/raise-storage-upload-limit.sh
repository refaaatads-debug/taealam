#!/bin/bash
# Session reliability pack (4/4): raise the upload cap for session recordings.
# NOT YET APPLIED. Run on the VPS only with the owner's approval:
#   sudo bash ops/raise-storage-upload-limit.sh
#
# Why: nginx caps request bodies at 50M (client_max_body_size in
# /etc/nginx/sites-available/ajyalalmaerifa.com:28). The session page uploads
# the cumulative lesson recording every 60s (overwrite); once the recording
# passes 50M every upload fails with 413 and the recording is stuck at its
# last sub-50M state (observed live 2026-11-25 07:36-07:44 UTC, 5x 413 on
# /storage/v1/object/session-recordings/*.webm; largest stored file 49.9MB).
# storage.buckets.file_size_limit is NULL (no DB-side cap), so nginx is the
# only limit.
#
# What this does: inserts a scoped override so ONLY storage uploads get 500M;
# the rest of the site keeps 50M. Backs up the config, validates with nginx -t,
# reloads, and prints the rollback command.

set -euo pipefail

CONF=/etc/nginx/sites-available/ajyalalmaerifa.com
BACKUP="/root/backups/nginx-$(date +%Y%m%d-%H%M%S)-ajyalalmaerifa.com.conf"

mkdir -p /root/backups
cp "$CONF" "$BACKUP"
echo "backup: $BACKUP"

if grep -q "client_max_body_size 500M" "$CONF"; then
  echo "override already present; nothing to do"
  exit 0
fi

# Insert a scoped location before the closing brace of the main server block.
# Requires the storage proxy to live under /storage/v1/ on this server block
# (it does today: uploads reach the storage container through it).
python3 - <<'PYEOF'
import re, sys
conf_path = "/etc/nginx/sites-available/ajyalalmaerifa.com"
src = open(conf_path).read()
# ^~ so this prefix wins over the regex location ~ ^/(rest|auth|storage|...)/
# that handles storage today; proxy target and headers mirror that block.
block = """
    # Large uploads: lesson recordings (chunked cumulative uploads, up to 500M).
    location ^~ /storage/v1/object/session-recordings/ {
        client_max_body_size 500M;
        proxy_pass http://kong_upstream;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
        proxy_send_timeout 300s;
        client_body_timeout 300s;
    }
"""
# Insert before the last closing brace of the file (end of the server block).
idx = src.rstrip().rfind("}")
if idx == -1:
    sys.exit("could not find server block end")
new = src[:idx] + block + src[idx:]
open(conf_path, "w").write(new)
print("override inserted")
PYEOF

nginx -t
systemctl reload nginx
echo "done. Rollback: cp $BACKUP $CONF && nginx -t && systemctl reload nginx"
