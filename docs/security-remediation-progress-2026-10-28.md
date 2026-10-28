# Security remediation progress — 2026-10-28

This is a progress record, **not completion of the full remediation request**.
The initial scope was web/supporting services. A later explicit exception permits
only the affected mobile profile/contact read adapters. Mobile design, unrelated
features, pre-existing edits, and its workflow are not changed by that exception.

## Release evidence

- Verified production web SHA for the financial/performance phase: `b116e982ab3dbb490ac61c7b3c58e204f131b97d`.
- GitHub Actions run `40660289915` completed successfully, and the VPS marker
  matched the run SHA. This includes the on-demand Agora change.
- Corrective migrations `20261028000200_restrict_wallet_mutation_rpcs.sql`,
  `20261028000300_atomic_admin_wallet_operations.sql`, and
  `20261028000400_guard_teacher_admin_fields.sql` have non-empty production
  fingerprints matching their source files.

## Verified production corrections

- Wallet mutation RPCs retain their signatures but reject untrusted callers.
  Production ACL checks confirm anon/authenticated cannot execute them and
  service_role can.
- Administrative wallet mutations use a persistent operation UUID, database
  serialization, a unique operation record, and an atomic audit log.
- Teacher administrative fields have an INSERT/UPDATE guard. Personal edits
  remain permitted; existing in-person approval safeguards remain installed.
- The stale-session cleanup RPC has a pinned search_path and restricted execution.
- Profile-update bank payload logging was removed.
- Clean installation, type checking, tests, and compilation gate deployment.
- Corrective migrations have a transfer manifest, content checksums, transactional
  fingerprint recording, matching-version skips, and explicit missing/mismatch errors.
- DOMPurify was updated to 3.4.17. Internal package-proxy download locations were
  removed from the lockfile without changing package versions or integrity hashes.
- Telephone cost calculations are normalized to cents before wallet RPC calls.

## Verification performed

- A uniquely named schema clone was created in the separate PostgreSQL test
  container. Existing databases were preserved. No production financial
  transactions were used for tests.
- Wallet authorization, invalid amounts, duplicate-credit rollback, teacher field
  authorization, and administrative audit-failure rollback tests passed.
- Eight simultaneous copies of the same administrative wallet operation produced
  one ledger effect in the isolated database.
- Migration runner checks covered matching skips, missing files, and changed hashes.
- Independent clean installation, types, tests, and production compilation passed.
- Latest local verification: 34 test files / 152 passing web tests.
- The public homepage was visually checked at a phone viewport; public home,
  search, packages, and teacher-application routes returned HTTP 200.
- Signed-in UI and real payment/call-provider transactions were not verified.

## Performance correction

The internal-call provider loads the Agora SDK on demand instead of importing it
into the initial application bundle. Local production compilation changed the
main bundle from approximately 2.37 MB (677 KB gzip) to 745 KB (230 KB gzip).
The SDK remains available in a separate approximately 1.61 MB chunk.
This is a bundle measurement, not proof of runtime latency or session capacity.

## Preserved source and backups

Pre-existing uncommitted VPS source changes were archived without replacing that
working tree. A fresh database dump was created and its archive listing verified
before the emergency wallet correction. Subsequent Actions deployments created
their normal pre-deployment database/web/functions backups.

These checks do **not** prove a complete disaster-recovery restore or offsite
backup retention.

## Remaining scope — do not mark resolved

1. Production phone/bank read isolation: the new strict migration in
   `docs/student-phone-privacy-release.md` supersedes the previous compatibility
   gate. Teacher access to student phones must not remain enabled for old clients.
   Verify its live migration fingerprint and policies before claiming closure.
2. Private certificates/support/chat files: production support-files and chat-files
   remain public. Complete fresh signed-URL access in all affected consumers and
   preserve existing files before changing bucket visibility.
3. Short-lived assignment links and full owner/participant/staff storage tests.
4. Complete staff-permission, role, family-link and protected-field coverage;
   the new teacher field guard is not a full authorization-system audit.
5. End-to-end payment/webhook/refund/withdrawal recovery and reconciliation.
   The administrative wallet transaction does not make all payment flows atomic.
6. Full fresh-schema migration replay and old-version upgrades. The validation
   database used the actual production schema, not a replay of all historical SQL.
7. A production cleanup-materials-daily cron invocation fails because its URL
   setting is missing; its request currently also lacks an explicit auth header.
   No deletion job was manually executed during verification.
8. Shared durable rate limiting, trusted proxy-chain review, staged CSP deployment,
   and complete host/container exposure review. UFW and host metrics were inspected;
   ports were not changed without dependency verification.
9. Offsite backup destination, retention, and a full isolated restore exercise.
10. Remaining dependency advisories and existing ESLint/type-safety debt.
    The latest production dependency audit still reported 2 high, 3 moderate,
    and 1 low package entries; no critical entries.
11. Gradual financial/live-session component separation and measured API/SQL tuning.
12. Signed-in student/teacher/admin/staff journeys, phone/RTL/accessibility, Riyadh
    boundary cases, and isolated capacity tests. No 100/500/1000-session capacity
    claim has been established.

## Approved profile/contact compatibility stage

**Superseded phone policy:** The booking-based teacher access described below was
revoked by the user. Migration `20261028000700_deny_teacher_student_phone.sql`
overrides it. See `docs/student-phone-privacy-release.md`; a booking never authorizes
teacher access to the student phone.

- Mobile identity enrichment and incoming caller names use explicit public
  projections; booking availability and subject lookup use the public teacher
  projection. Existing owner-only private profile/bank settings remain unchanged.
- The phone flow uses `get_booking_contact`, scoped to the requested student and
  booking. The function returns only identity/phone, requires authentication,
  and permits teachers only for confirmed/completed bookings they own. Own-contact
  and existing administrator access remain allowed.
- Pending/unrelated/mismatched bookings cannot authorize phone access. A stale
  mobile request cannot overwrite the newly selected participant's phone.
- Matching web cross-user reads use the same public/contact contracts.
- Migration 20261028000500 is the additive compatibility stage. Migration
  20261028000600 removes broad private-table read policies and is deliberately
  excluded from automatic production application until mobile release evidence.
- Both stages were tested together on an isolated clone using actual database
  roles, including anonymous denial, unrelated-user denial, permitted teacher
  contact, student owner settings, teacher bank ownership and administrator access.
- Mobile type checking, four new source-contract checks, and existing profile,
  availability and call-direction tests passed. Signed-in native UI, an installed
  mobile release and live telephone transactions were not verified.
