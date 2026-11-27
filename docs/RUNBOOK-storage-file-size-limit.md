# Runbook: raise the storage upload limit (50 MiB -> 500 MiB)

Why: recordings above 52,428,800 bytes get HTTP 413 from supabase-storage (seen 11 times on 2026-11-25).
nginx already allows 500M on `/storage/v1/object/session-recordings/`. The cap is the storage container env.

Where: VPS `/root/taealam/supabase_setup/docker/docker-compose.yml`, service `storage`, line `FILE_SIZE_LIMIT: 52428800`.

Do ONLY when no session is open (`select count(*) from sessions where started_at is not null and ended_at is null` = 0).

1. Backup: `cp -a docker-compose.yml docker-compose.yml.pre_filesize_$(date +%Y%m%d)`
2. Edit: `FILE_SIZE_LIMIT: 524288000`
3. Validate: `docker compose config -q`
4. Recreate only storage (seconds): `docker compose up -d --no-deps storage`
5. Verify: `docker inspect supabase-storage --format '{{range .Config.Env}}{{println .}}{{end}}' | grep FILE_SIZE`, storage container healthy, site and an existing recording signed URL still load, then upload a 60 MB test file to a test path in `session-recordings` and delete it.

Rollback: restore the backup file, run step 4 again. Nothing else changes (no DB, no nginx, no other container).
Impact while recreating: uploads/downloads of files fail for a few seconds; live audio/video (Agora) and the session timer are unaffected.
