#!/usr/bin/env bash
# Run on the VPS only, against an explicitly selected container/database.
set -Eeuo pipefail
file="${1:?A migration file is required}"
container="${AJYAL_DB_CONTAINER:-supabase-db}"
database="${AJYAL_DATABASE:-postgres}"
name="$(basename "$file")"
[[ "$name" =~ ^[0-9]{14}_[a-z0-9_]+\.sql$ ]] || { echo "Invalid migration name" >&2; exit 1; }
test -s "$file" || { echo "Missing or empty migration: $name" >&2; exit 1; }
hash="$(sha256sum "$file" | cut -d' ' -f1)"
[[ "$hash" =~ ^[0-9a-f]{64}$ ]] || exit 1
psql_cmd=(docker exec -i -u postgres "$container" psql -U postgres -d "$database" -v ON_ERROR_STOP=1)
stored="$("${psql_cmd[@]}" -Atc "SELECT sha256 FROM public.deployed_migration_fingerprints WHERE migration_name='$name'" </dev/null)"
if [ -n "$stored" ]; then
  test "$stored" = "$hash" || { echo "Migration fingerprint mismatch: $name" >&2; exit 1; }
  echo "Verified, skipping: $name"
  exit 0
fi
{
  echo 'BEGIN;'
  # Our corrective migrations have a single outer transaction. Keep their bodies,
  # but make the fingerprint part of that SAME transaction.
  sed '/^BEGIN;$/d; /^COMMIT;$/d' "$file"
  printf "\nINSERT INTO public.deployed_migration_fingerprints(migration_name,sha256,source) VALUES ('%s','%s','verified corrective migration runner');\n" "$name" "$hash"
  echo 'COMMIT;'
} | "${psql_cmd[@]}"
actual="$("${psql_cmd[@]}" -Atc "SELECT sha256 FROM public.deployed_migration_fingerprints WHERE migration_name='$name'" </dev/null)"
test -n "$actual" && test "$actual" = "$hash"
echo "Applied and verified: $name"
