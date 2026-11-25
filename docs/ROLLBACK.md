# ROLLBACK / الرجوع للنسخة السابقة

Three things can be rolled back: the website (web), the database, and the mobile app (OTA update).
Server: `root@api.ajyalalmaerifa.com` (SSH key or password, never change SSH settings).

## 1) Web (website + edge functions)
Every deploy of `main` first saves a backup in `/root/backups/ajyal-predeploy-<COMMIT_SHA>/`
(web files, edge functions, a DB dump, and a `restore.sh`). The folder named with a commit
holds the state BEFORE that commit went live.

```sh
ls -dt /root/backups/ajyal-predeploy-* | head -5      # newest first; pick the commit you want to undo
sh /root/backups/ajyal-predeploy-<SHA_TO_UNDO>/restore.sh   # restores site files + edge functions, reloads nginx
```
Then undo the commit on GitHub so the next deploy does not bring it back:
open a PR that reverts it (`git revert <SHA_TO_UNDO>`). Check: `curl -sI https://ajyalalmaerifa.com/` returns 200.

## 2) Database
Backups: daily 03:00 `/root/backups/supabase_<date>.sql.gz` (pg_dumpall, 7 days) and the
`postgres.dump` inside each predeploy folder above. A restore test into a plain Postgres 15 was verified.
Do NOT overwrite the live database in one step. Safe way (restore into a scratch DB, then copy back only what you need):

```sh
docker exec -u postgres supabase-db createdb -U postgres restore_check
docker exec -i -u postgres supabase-db pg_restore -U postgres -d restore_check --no-owner \
  < /root/backups/ajyal-predeploy-<SHA>/postgres.dump
docker exec -u postgres supabase-db psql -U postgres -d restore_check -c '\dt public.*'   # inspect, copy needed rows back
docker exec -u postgres supabase-db dropdb -U postgres restore_check                     # clean up
```
A full in-place restore of the Supabase database is not tested (it can break auth); decide it with the owner first.

## 3) Mobile app (OTA update)
Updates are published with EAS Update. To go back to an older update:

```sh
cd artifacts/ajyal-mobile
npx eas-cli update:list --branch <branch>                                  # find the previous update group id
npx eas-cli update:republish --group <PREVIOUS_GROUP_ID> --destination-branch <branch>
```
Fallback: `npx eas-cli update:rollback` rolls back to the embedded build. Check on a test phone before telling users.
(`<branch>` is the branch the app build uses; confirm it with `eas update:list` first.)
