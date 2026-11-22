#!/bin/bash
# Daily call of the cleanup-materials edge function (deletes expired recordings).
# The function only accepts the service key, which is read here from the compose .env.
set -e
ENV=/root/taealam/supabase_setup/docker/.env
KEY=$(grep -E '^SERVICE_ROLE_KEY=' "$ENV" | head -1 | cut -d= -f2-)
curl -s -m 120 -X POST https://ajyalalmaerifa.com/functions/v1/cleanup-materials \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{}'
echo
