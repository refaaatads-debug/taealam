# Non-deploying release gates, 24 November 2026

Scope: combined web source 79d96da and API 2f9e445, followed by this evidence/test-only commit. Nothing deployed, merged into main/replit-dev, written on the VPS, or mutated in the database. Read-only catalogs contain definitions, not customer records. No customer attachments downloaded.

## Passing local checks

Independent Git archive exports, no old dependency symlinks:

- Web: npm ci --ignore-scripts --no-audit --no-fund, typecheck, 294 existing tests and production Vite build. Five additional isolated guard tests added here cover deleted/rejected screens, support reachability, restored-route entry, and characterize existing fail-open network errors. Full final count 299.
- API: pnpm 10.26.1 install --frozen-lockfile --ignore-scripts with API/client dependency filters; 72 tests; build; tsc project-reference build for db/zod/client followed by API no-emit check. Running API tsc before building references produces TS6305, not a source defect. Native sharp successfully generates a synthetic WebP with this installation.
- Production browser config: all four fields nonempty. Supabase URL host matches production. Publishable key, CAPTCHA site key and Maps key hashes match strings in the currently served JS; no values logged/committed. All four appear in the local production bundle, validation placeholders absent. This is not CAPTCHA/Maps provider account verification.
- Existing pair-chat mock tests cover RPC success, error propagation, canonical pair filters and 205 booking IDs split 100/100/5. This is not live load/latency testing. API image tests cover synthetic attachment allowlist, size/path/format/cache/concurrency behavior, not production signed-file access.
- Prepared shell scripts pass bash syntax checks and a fully local synthetic archive/rollback round trip, including pnpm workspace symlink preservation. Service, HTTP and database commands were mocked in that fixture. Not executed on the VPS, not a real backup creation or full restore rehearsal.

## Read-only live findings

21 recorded deployed migration SHA256 fingerprints exactly match files. This proves only those records, not complete schema parity. Payout approval and online-session completion function bodies match source after whitespace/comment normalization. Payout source requires admin/withdrawal permission, locks the withdrawal row, checks allocations and reuses the recorded payment. Simultaneous authenticated requests were NOT sent.

Live guard_teacher_admin_fields differs from its recorded migration: it permits a nested system-trigger update that changes only avg_rating, total_reviews and updated_at. Reapplying the canonical source could break ratings. Preserve this live behavior. Live guard_profiles_client_writes blocks ordinary clients changing deletion/status fields, so owner UPDATE RLS is not evidence of self-restore. These guards are preserved in verified-live-profile-guards.sql.review, not auto migrations. Pair RPCs are likewise evidence-only. Some live teacher-policy names do not appear in migration files; no blanket policy parity claim.

RLS enabled for the reviewed profile, teacher, chat, withdrawal, payment, support and storage tables. Support policies authorize ticket owners without testing profile deletion, matching the support-while-blocked routing intent. Administrative permission writes require admin; ordinary users read their own permissions. These are source/catalog checks, not authenticated role tests.

**Existing attachment exposure gate:** chat-files and support-files are PUBLIC buckets. Their SELECT policies do not establish private public-object downloads. Current chat/support consumers use getPublicUrl, so changing buckets to private without signed-URL client changes would break attachments. No bucket change is included. A separate coordinated client/API/storage fix needs synthetic isolated tests for owner, intended recipient, unrelated authenticated user, anonymous user and expired links before production approval. Session recordings and assignment-files buckets are private. Storage upload size/MIME limits are unset, so client checks alone are not a server storage guarantee.

**Existing access gate:** ProtectedRoute ignores query errors and clears block flags on thrown errors, permitting content on failed account reads. The new test explicitly characterizes this existing behavior, not endorses it. UI gates are not server-side account suspension enforcement.

Fresh read-only health: homepage 200, API /api/healthz 200, unauthenticated /api/teachers 401.

## Not established, not passed

No isolated staging DB/service established. Checked actual web/API environment URL hosts, available DB names (postgres and _supabase), systemd runtime, and known source staging folder. The folder is not a running staging service. This is a checked scope limitation, not proof no separate service exists elsewhere.

Approve/reject/restore writes, authenticated permission boundaries, support while actually blocked, wallet/payout double-submit concurrency, cross-user attachments, expired links, and large authenticated chat require an isolated service and synthetic accounts. No SQL fixture, even rollback-contained, was run on production. No new database/paid provider/staging service was created.

## Concise proposed production scope, conditional and NOT ready to apply

1. Pin reviewed combined web/API commits. A runtime-only release could update frontend plus rebuilt API/runtime dependencies, preserving current live admin/support behavior and newer source fixes. No APK, OTA, store, payments settings, SSH, DB migration or mounted function change.
2. Do NOT merge web main to perform it. The existing push-to-main workflow deploys with conditional database/security/function steps beyond this scope. Require a separately reviewed exact runtime apply path and explicit owner GO.
3. Before GO: isolated synthetic staging suite above, attachment/access decisions, verified clean backups and restore rehearsal, fresh hash/source comparison, final artifact manifest. Current recommendation is HOLD production, allow staging preparation only if separately authorized.
4. After explicit GO: run prepared backup, verify archive checksums and readable pg_dump contents, rehearse recovery off-production, apply only pinned runtime artifacts with old hashed frontend assets retained, restart API only if approved, perform public and authenticated smoke checks. Stop and rollback on failure.
5. Rollback: prepared/rollback-runtime.sh restores complete frontend and API dist/dependencies/workspace runtime exports, not git reset or DB restore. Backup includes untouched functions and emergency DB dump, but rollback script does not change either. Secrets stay private in root-only backup. Never restore DB over new user activity as part of runtime rollback. Script assumes confirmed original directory/service paths; revalidate before apply. It still needs full isolated execution rehearsal, disk-space sizing and off-host recovery verification.
