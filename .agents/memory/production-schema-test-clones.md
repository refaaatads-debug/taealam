---
name: Production schema test clones
description: Environment-specific limits when cloning Supabase production schema into the isolated VPS PostgreSQL test database.
---

For production-like SQL tests on the VPS, create a separate database and restore the schema without the `cron` schema or `pg_cron` extension: the test container's `cron.database_name` is fixed to its existing test database. The test database's `postgres` role also lacks superuser privileges, so omit the realtime function's privileged `SET log_min_messages` statement from the schema-only restore.

**Why:** A full production schema restore otherwise fails on cron database identity and a privileged realtime setting; changing the existing test databases would risk unrelated tests.

**How to apply:** Preserve existing test databases, create a uniquely named isolated clone, filter only those environment-specific objects, then apply and test the target migrations there.
