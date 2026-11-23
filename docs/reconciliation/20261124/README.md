# VPS source reconciliation, 24 November 2026

DRAFT, partial reconciliation. No merge or deployment is requested by this PR. Production was read only. This branch is NOT a certified replacement for the served frontend.

## What was done

Based on current main `131f4d25c1a9c8a5011ab9bc1d44b1df00d96b3c`, not the old dirty VPS checkout `e28e8fcc7040a69ad9205d5d8e60e450dd29e6c2`.

- Captured all 20 modified tracked web source files, six new components and four historical SQL migrations from the VPS, with base-to-working patches and SHA256 evidence. No env files, databases, customer records or backups imported.
- Integrated recoverable account deletion/restore, rejected-teacher support screen, consistent approval/rejection writes, profile upsert, student admin table/KPIs, contact dialog, permissions panel and conversation fallback while keeping current schedule behavior.
- Retained current admin dashboard styling, teacher approval conflict detection, signed certificate component, prepaid-minute subscription display, financial withdrawal RPC and balance safeguards. Current permission editor remains available as well as the captured permissions panel.
- Actual mounted functions are authoritative for runtime code. Imported only their eight-file delta against main, byte-for-byte; retained shared provider/rate-limit/CORS security helpers. The tutor token handler still returns `live_voice_disabled` before any provider call. Text and read-aloud preserved. Cap helper files are dependencies of current runtime code, not approval to restore continuous voice.
- Source-level voice UI disable uses the existing PR32 frontend change. The compiled production CSS/JS patch is not pasted into source or deployed here.

## Deliberately unresolved

This is not a wholesale copy. Sixteen tracked files had overlapping edits; four tracked files merged cleanly. `decisions.json` records the initial merge choices; the notes here describe final targeted adaptations. Every old edit is retained under `vps-patches/`, including edits not activated.

- `WithdrawalRequestsTab`: retain current atomic withdrawal-payment RPC, earning-ledger writes, allocations and states. Legacy VPS UI replaces these with incompatible writes. Needs focused UI port, not choosing the VPS file.
- `TeacherProfilesTab`: retain current conflict-aware approval status and server-calculated withdrawable balances. Old table layout must be ported separately if wanted.
- `AdminDashboard`: retain current overview, security error handling, support workflow and newer layout. Targeted VPS permissions tab and approval/rejection writes integrated; older overview/teacher-list visual rewrite not copied.
- Student/teacher dashboards: retain current concurrent fetch/error/disposal handling and unified schedule. Old independent dashboard additions are not activated.
- Chat: retain current canonical pair filters, not the old RPC replacement. Live SQL definitions/grants for `get_pair_messages` and `get_pair_booking_ids` were not captured or audited, so those calls are not introduced.
- Four stale checkout AI handlers have model constants/direct environment reads superseded by current shared model/provider/security helpers. Their patches remain evidence, not runnable regressions. `ai-tutor-chat` instead matches the actual mounted runtime.
- Four old migrations are `migrations-review/*.sql.review`, outside automatic migrations. The session-completion trigger replacement predates newer financial logic; teacher status backfill could reset pending labels. Do not apply blindly. Presence on disk is not proof of DB application. No migration was applied in this task.
- Production compiled frontend still cannot be reproduced byte-for-byte from the old checkout. This PR does not solve that historical build provenance gap.
- The imported route guard mirrors live fail-open read-error behavior and is only a UI guard, not proof of server authorization/deletion enforcement. A separate security review remains necessary.

## Checks

- Existing web suite: 219 tests across 41 files passed.
- Added UI suite: four tests passed (support access for both blocked screens, numeric table sorting and zero KPI rendering).
- Web TypeScript check passes.
- Read-only artifact parity script verifies all mounted function hashes, captured patches/migrations and preservation of current financial/provider safeguards.
- Inspected actual React component previews at 390x844 for both blocked screens and table/KPIs with synthetic data. Text and support buttons fit. No authenticated production-flow visual proof.
- Full Vite production build did NOT complete in this environment: default heap exhausted, larger-heap attempts killed during chunk rendering. No source or production minify/shrink setting changed. Build validation remains a merge/release gate, as do authenticated admin/deletion/teacher/schedule tests.

## Production unchanged

No SSH/password/root/authorized_keys settings, service restart, database mutation, provider call, store release or OTA. Separate mobile-repo API reconciliation covers live push-image source and dependencies. Original evidence snapshot remains PR33 and voice-disable source PR32; this draft overlaps them, so review/reconcile before any future merge.
