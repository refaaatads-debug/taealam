# Proposed source-to-production release plan

NOT EXECUTED. Needs explicit owner approval for deployment/main merge. The existing web push-to-main workflow deploys and conditionally changes DB/functions, so merging main is not a source-only action.

## Intended live differences

Web should retain current VPS account block/restore/rejected teacher/contact/permission/search behavior while also carrying the newer GitHub financial atomicity/ledger/allocation, teacher state conflict/server balance, public route/auth refresh, reporting, study guides/SEO and current UI. Tutor live conversation remains off; text/read-aloud preserved, ElevenLabs credits not changed. Some old admin layout is replaced by newer main styling with missing live filters/KPIs restored, not a promise pixel-identical UI.

API should retain live push images/derivatives/cache/dedupe, add/retain current safe redirect and booking status fixes and shared deliveryMode contract. It keeps current dependency security overrides/version declarations, not older VPS declarations. No app APK, OTA, store release, Stripe configuration or SSH/login setting change in this plan.

## Before any approval to apply

1. Keep exact08:29snapshot branches and existing live backups. Freeze new source changes, record final SHAs; rerun clean dependency installation/lockfile, typecheck/tests/production builds with final public production env. Local compilation here did NOT validate deployable production configuration. Confirm all required browser config including CAPTCHA/Maps as well as API/Supabase. Do not reuse a validation-placeholder bundle.
2. Review/replace the current automatic deployment path for this release. It includes DB/function writes beyond just copying frontend; do not merge and hope those branches skip. Propose the precise allowed changeset, without changing workflow or server until approved. Prefer explicit staged release over the old broad workflow.
3. Compare live DB definitions, applied migration markers/hashes, table policies and schemas against source. Existing account soft-delete columns/teacher approval constraint and pair RPCs were read-only verified. Do NOT run the four old captured migrations. Do not rerun session trigger/backfill. No new DB mutation is required merely to archive source. If a missing security/financial migration is truly required, review separately with backup, transaction/idempotency/concurrency test and explicit DB change approval. This review is still open, not completed by unit tests.
4. Run isolated staging end-to-end cases with synthetic student/teacher/admin accounts, including failed reads, support access while blocked, reject/approve and restore, permissions, empty/large chat history, prepaid balances, atomic withdrawal double-submit, images, text/audio controls, real teacher audio/video call when native release is in scope. No production payout or provider-credit call without separate authority.

## Staged apply after explicit approval

- Recheck live heads/hashes just before applying. Backup current entire served frontend, mounted functions, API dist+source+dependency manifests, service environment references (secrets never committed) and DB snapshot appropriate to approved changes. Verify backups readable and rollback location supported. Current exact source archive alone is not a complete rollback backup.
- Build final web/API in staging from pinned combined commits with clean locked dependencies and approved production env. Record manifest of source/config artifact hashes, keeping private env outside GitHub.
- Apply only approved DB changes if any, then required mounted functions atomically, then API dist+dependencies if approved, then frontend. Health/read-only checks between components; preserve old hashed frontend assets for existing tabs. Restart only necessary service if included in approved plan; no SSH/auth changes.
- Check homepage/health200 and authenticated teacher-directory authorization, exact served frontend/API/runtime function hashes against release manifest, live-voice disabled, normal text/chat/teacher features. Compare checkout source hash tree with published GitHub commit, excluding env/dependency/cache/data by explicit manifest. Report any deviation, never say100%without matching the agreed scope.

## Rollback

For frontend/function/API-only release: restore exact pre-release files from verified complete backups, restore prior API dependency set, restart only affected approved services, verify previous homepage/functions/dist hashes and health. Do not use git reset alone against dirty server checkout. Existing voice-hide rollback only removes that one patch, it is NOT rollback for the combined release. Exact future backup path/commands cannot be finalized until staged backup creation; do not pretend a generic command is verified.

For DB changes: never promise file rollback reverses DB. Use reviewed inverse/forward corrective migration or tested DB restore appropriate to writes since backup; financial ledger changes require special care to avoid losing user activity. Without that plan, do not approve DB deployment. Keeping DB unchanged makes rollback narrower.

## Current recommendation

Combined branches are ready for final source review/staging preparation after local checks, not direct production approval. Resolve DB delta/old auto-deploy scope and staging end-to-end gaps first. Then ask the owner one concrete go/no-go for an exact pinned release with changes, migration list (ideally none), service impact and verified rollback. Main/replit-dev and VPS remain unchanged now.
