#!/bin/bash
# Certbot deploy hook — runs after every successful SSL renewal
# Syncs sites-available with sites-enabled then reloads nginx
# Prevents conflicting server_name warnings after cert renewal

LOG="/var/log/certbot-deploy.log"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

echo "[$TIMESTAMP] SSL renewed for: $RENEWED_DOMAINS" >> "$LOG"

# Sync sites-available/ajyalalmaerifa.com with the active config in sites-enabled
# (Certbot reads sites-available; we want them identical to avoid conflicts)
if [ -f /etc/nginx/sites-enabled/ajyalalmaerifa.com ]; then
    cp /etc/nginx/sites-enabled/ajyalalmaerifa.com \
       /etc/nginx/sites-available/ajyalalmaerifa.com
    echo "[$TIMESTAMP] Synced sites-available/ajyalalmaerifa.com" >> "$LOG"
fi

# Test nginx config
if nginx -t 2>> "$LOG"; then
    nginx -s reload
    echo "[$TIMESTAMP] Nginx reloaded OK after cert renewal" >> "$LOG"
else
    echo "[$TIMESTAMP] ERROR: nginx config test failed — not reloading" >> "$LOG"
    exit 1
fi

echo "[$TIMESTAMP] Deploy hook completed successfully" >> "$LOG"
