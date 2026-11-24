# Private-file preparation evidence, 24 November 2026

No production privacy cutover. Existing buckets/policies and live client releases unchanged.

## Real JWT test run

One private bucket ajyal-private-test-20261124-1114 was created, exercised and deleted. Six narrowly named synthetic auth users got real GoTrue-issued JWTs through admin-generated one-time links verified locally, with no email-send request/password. Synthetic admin/withdrawal permission, certificate and support ticket fixtures created. Auth profile/default-role/zero-wallet triggers were inspected first. No payout/earning/booking/session was created. No provider/mail/push action requested. Secrets/tokens are not in the report.

90/90 assertions passed: seven caller classes (owner, unrelated user, counterpart, admin, withdrawal-manager, non-admin assigned support worker, anonymous), five path families, sign/direct JWT read/anonymous public denial, valid bearer download and expiry, permitted/forbidden upload and empty outsider list. Labels containing denied roles record expected denial as PASS, not access success.

Important limits: chat pair and withdrawal relationship used fixed test-only bindings. No real booking/withdrawal-table policy assertion; inserting those records can invoke financial/session/notification triggers and was avoided. Certificate path owner and support-ticket table relationship were tested. Copied valid signed URL is a bearer credential and works until expiry as expected. Not an immediate-revocation mechanism.

All cleanup counts zero: auth users, profiles, zero-wallets, roles, permissions, bucket, objects, test policies, certificate and ticket. Existing25storage policies MD5 before/after3802baaf0d58e41640b578228527b623. All specific user deletes and object/bucket deletes returned200. First seed failed on granted_by NOT NULL, rolled back and cleaned all six users; the successful retry supplied the synthetic admin. No shared policies were changed. Cleanup verified from source catalogs, not just API success.

Original server evidence /root/backups/privacy-20261124-1114/report.json and ids.json are root-only. They contain synthetic identifiers, no tokens/passwords. Sanitized report is included here. Existing upload policies do not apply to the new bucket; test SELECT/INSERT were explicitly bucket-gated and removed.

## Reviewed production diff, not executable approval

PROPOSED-SELECT.sql.review removes the four existing chat/support read policies and replaces them with exact structural-owner/ticket/booking/withdrawal-reference predicates. Real column/policy names checked live. No new helper/SECURITY DEFINER, anonymous access, broad support-staff permission, substring match or bucket change. Admin remains bucket-scoped. Non-admin assigned ticket worker stays denied, consistent with existing table RLS.

This proposal intentionally accepts only simple ASCII generated filenames. Unknown percent-encoded/unicode/signed stored-reference shapes fail closed. A read-only aggregate shape inventory is still required. Do not claim this diff preserves every legacy object without that check. Withdrawal exact match supports canonical path, bucket-prefixed path and current-origin public URL only; matching another teacher's path through a forged record remains forbidden by row.teacher_id/path equality. Ticket rule uses structural ticket ID, not a user-editable URL reference. Existing broad upload policy must be replaced in a separately reviewed INSERT/UPDATE/DELETE diff before any private cutover; this file is SELECT-only, not complete deployment SQL.

## Remaining release gates

- Exact relational booking/withdrawal RLS tests without financial/provider side effects, or a separately authorized isolated schema/fixture approach. No production trigger disabling.
- Cross-reference spoof/encoded-path test expansion, expiry refresh/concurrent open/account-switch and all image/PDF/audio/download UI cases. Current90checks are storage API assertions, not web/mobile UI acceptance.
- Upload overwrite/delete/retry policy diff, MIME/size limits and legacy path inventory.
- Actual installed/Play/Expo mobile baseline. Source1.0.1/versionCode192 does not prove device state. Finance currently falls back to original URL; chat/profile parsers also need trusted-origin review. No mobile code/release changed in this phase.
- Browser signed-view error/retry placeholders and on-demand re-signing, no persisted tokens/provider forwarding. Existing PR34 preparation is not ready to deploy simply because test bucket passed.
- Final approval for exact SQL and client release, object-byte backup plus metadata, policy precondition hashes, private-compatible recovery pair. Keep buckets private on failure, disable attachment availability or fix forward instead of automatically publicizing. A pg_dump alone is not a complete Storage object-byte backup.

No cutover GO requested yet. Return the limits with the evidence. Running production remains option A and buckets remain public.
