#!/usr/bin/env bash
# Prepared only. Separate approval required. No DB restore, functions write,
# credentials change, service-unit edit, or Git reset. Runtime lib exports are restored.
set -euo pipefail
umask 077
: "${APPROVED_RELEASE:?Set the release identifier of the pre-release backup}"
: "${CONFIRM_RUNTIME_ROLLBACK:?Must explicitly equal the approved release identifier}"
[[ "$APPROVED_RELEASE" =~ ^[a-zA-Z0-9_-]{7,100}$ ]] || exit 2
[[ "$CONFIRM_RUNTIME_ROLLBACK" == "$APPROVED_RELEASE" ]] || exit 2
backup="/root/backups/reconcile-$APPROVED_RELEASE"
api=/opt/ajyal-api-github
(cd "$backup"; sha256sum -c SHA256SUMS)
# Stage first on the same filesystems. This is not a DB rollback.
webstage=$(mktemp -d /var/www/reconcile-restore.XXXXXX)
apistage=$(mktemp -d "$api/.reconcile-restore.XXXXXX")
tar -xzpf "$backup/frontend.tar.gz" -C "$webstage"
tar -xzpf "$backup/api-runtime.tar.gz" -C "$apistage"
test -s "$webstage/html/index.html"
test -s "$apistage/artifacts/api-server/dist/index.mjs"
systemctl stop ajyal-api
# Keep displaced runtime directories for investigation, never delete them here.
for path in artifacts/api-server/dist artifacts/api-server/node_modules node_modules lib; do
  if [ -e "$api/$path" ] || [ -L "$api/$path" ]; then mv "$api/$path" "$apistage/displaced-$(printf '%s' "$path" | tr / _)"; fi
  mv "$apistage/$path" "$api/$path"
done
for path in package.json pnpm-lock.yaml pnpm-workspace.yaml; do cp -a "$apistage/$path" "$api/$path"; done
mv /var/www/html "$webstage/displaced-html"
mv "$webstage/html" /var/www/html
systemctl start ajyal-api
nginx -t
sha256sum -c "$backup/live-artifacts.sha256"
curl --fail --silent --show-error https://ajyalalmaerifa.com/ -o /dev/null
curl --fail --silent --show-error https://api.ajyalalmaerifa.com/api/healthz -o /dev/null
status=$(curl --silent --output /dev/null --write-out '%{http_code}' https://api.ajyalalmaerifa.com/api/teachers)
test "$status" = 401
printf '%s\n' 'Runtime rollback hashes and basic health pass. Authenticated smoke tests remain required.'
