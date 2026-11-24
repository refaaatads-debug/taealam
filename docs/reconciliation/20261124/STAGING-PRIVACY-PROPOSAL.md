# Staging and attachment-privacy proposal
24 November 2026. Preparation only, no resource created or paid for.

## Decision

Recommend a separate Supabase Free project in a Free organization, if the user's account has an available free-project slot. Vendor price: **USD 0/month**, no paid upgrade/add-on authorized. Keep test DB below 500 MB, object storage below 1 GB and egress below 5 GB. Use local frontend/API processes, no paid frontend hosting, external email/SMS, AI, push delivery or payment calls. Account eligibility/free slots have NOT been inspected. A paid organization cannot mix Free and paid projects; do not accidentally add a billed project there.

If no free slot is available, stop and ask rather than upgrade. A local self-hosted Supabase stack has **USD 0 Supabase service fee** on existing suitable hardware, but hardware/electricity are not quoted or free by assumption. Docker is not installed in the current execution environment, so this is not immediately runnable here. Official self-hosting baseline: 4 GB RAM, 2 CPU cores, 40 GB SSD minimum; recommended 8 GB+, 4 cores+, 80 GB+ SSD. Do NOT run a second stack on production VPS to save money, that risks shared resources and violates the isolation scope.

Paid fallback for a separate organization with one Micro project: published Pro base **USD 25/month before applicable taxes and extra usage/add-ons**, including USD 10 compute credit covering one Micro. A Micro added to an existing paid organization adds about USD 10/month compute if credit already used. Exact account-specific tax and eligibility are unknown, so neither is an approved or final payable total. No paid plan is needed for the proposed functional tests. Branching is paid and unnecessary.

## Setup after separate authorization

1. Verify actual account Free eligibility and choose a distinct Free organization/project. Confirm displayed total USD 0, no paid upgrade/card/add-on, then create only after approval. For local alternative, approve the named existing non-production host first; verify Docker capacity and bind services to localhost, never expose the development stack publicly.
2. Pin reviewed web/API commits; record dependency and artifact manifests. Create staging-only env/keys through secure storage. Hard guard scripts must reject the production hostname/IP and production project identity before any seed/test. No production secrets, database rows, storage objects, auth users or email addresses copied.
3. Build schema-only baseline from reviewed catalog/schema definitions, not all historical migrations blindly. Include live profile protections, the narrow rating-trigger exception, pair-chat RPCs, constraints, RLS, storage policies and required grants. Never replay the old approval backfill/session rewrite on production. Diff the staging catalog against the approved baseline; document managed-host versus self-host differences.
4. Disable or stub external side effects at DB trigger, edge function and API worker levels: no outbox sender, Expo tokens, real SMTP/SMS, AI, Stripe/webhooks, cron payouts or provider credentials. Staging auth users are synthetic admin, delegated withdrawal manager, teacher A/B, student A/B, blocked/deleted/rejected accounts and anonymous client. Use reserved example-domain addresses, do not send mail. Passwords generated/saved securely, not fixtures or Git history.
5. Seed synthetic bookings, support tickets, certificates, withdrawals, ledger and objects only. Create chat-files/support-files private in staging, recordings/assignments private, site assets remain public. Policy completeness first: certificate owners/admins, withdrawal teacher/admin/authorized manager, AI-support uploader and ticket participants need explicit, least-privilege rules. Existing broad upload rules and substring file-url matching need review, not copy as a security guarantee.
6. Run the matrix below through real authenticated Supabase/Storage clients and API with service-role bypass forbidden for role assertions. Test backend rejection directly, not merely hidden buttons. Keep assertions and sanitized report; remove/reset only the approved staging resources after review.

## What each gate certifies

| Test | Passing evidence | Does not certify |
|---|---|---|
| Approve/reject/soft-delete/restore | Real admin transitions, ordinary user denied, profile protected, ratings still update | No claim of zero bugs or all future workflows |
| Read failure/account switch | Failed/null/returned-error checks show retry, no stale protected page, support still works; restore refresh works | UI fix is not server-wide suspension enforcement |
| Roles and support | Owner/admin/manager/outsider/anonymous allowed and denied exactly as specified, blocked owner can open own support | Does not prove unrelated tables/RPCs secure |
| Payout concurrency | Two simultaneous calls, one payment/ledger debit/allocation consumption, retries same result, insufficient/rejected denied | No real bank transfer or production settlement test |
| Attachments | Intended reader signs and reads, outsider/anonymous cannot mint or directly retrieve, expired URLs fail, denied signing has no fallback, old public/signed/path refs normalize | Anyone holding a still-valid signed URL can use it until expiry |
| Large chat | Synthetic 205+ bookings and long histories, RLS isolation, bounded requests, error states, timing recorded | Not production-capacity certification on Free compute |
| Recovery | Stage artifacts/backups restored in isolated service, checksums/service health/auth smoke pass | Local mocked archive test is not live restore proof |

## Source-only hardening prepared in draft PRs

- Web account guard denies protected routes on thrown or returned query errors or missing required profile; retry and support path remain. Result is keyed by user/role/route to avoid stale approval. This does not change database rules or prove server-wide suspension.
- A shared sensitive-object parser accepts only configured project origin, known buckets and safe decoded paths. Legacy public URLs, signed URLs and object paths normalize to an object reference; old bearer tokens are discarded. Authenticated createSignedUrl issues five-minute view URLs with no public fallback.
- Chat/live-chat, user/admin support, profile/admin certificates, withdrawal views and AI-support attachment previews resolve URLs for the current identity. Signed view URLs are not written into DB/local history; original stable references remain. A four-minute refresh and per-batch dedupe limit routine calls; no global cross-user URL cache. Denied files are hidden, not disclosed through the old public link. Stable public-shaped DB references from old upload code are identifiers only, not a privacy claim. Bucket settings are unchanged.
- API notification-image resolver excludes chat/support attachments and any Storage signed bearer URL, so private media cannot be promoted into its public image derivative/push path. Site-assets notifications remain public by design. No new service-role signing endpoint.
- Local source inspection finds mobile chat/certificate/finance already attempts signed links, but finance still falls back to the original URL and source comments wrongly claim buckets are private. Installed APK/OTA baseline is not verified. No mobile source/release changed here. Mobile compatibility and stale clients remain a mandatory production gate.

## Coordinated production cutover, not authorized

1. Pass staging matrix and audit every web/mobile/API/edge consumer. Add missing owner/manager/certificate/AI-storage policies and exact object-path matching with synthetic denial tests. Confirm approved file-size/MIME limits server-side. Do not switch bucket settings alone.
2. Obtain explicit approval for exact reviewed client/API release, storage policy/bucket change list and user impact. Release compatible clients first; choose handling for old installed clients and already-public cached copies. Publicly exposed copies cannot be retroactively recalled by merely changing bucket metadata.
3. Verify complete backup, real recovery rehearsal, manifests and current live drift. Apply only approved changes. Confirm anonymous legacy public URL fails and authorized signed URL succeeds without downloading customer data, using synthetic production probe only if explicitly approved.
4. Rollback code and storage separately. Reverting to public buckets re-exposes private files and is NOT the automatic rollback. Prefer fixing forward or temporarily disabling attachment access; public reversion would need an explicit privacy decision. Existing runtime rollback scripts do not change bucket metadata/policies or DB.

## Cost sources, checked 24 November 2026

- https://supabase.com/pricing : Free quotas, USD 0; Pro USD 25, credits/add-ons.
- https://supabase.com/docs/guides/platform/billing-on-supabase : organization-level plan and two-Free-project account limit.
- https://supabase.com/docs/guides/local-development : local full Auth/Storage/Postgres stack, container prerequisite, localhost binding, no public development stack.
- https://supabase.com/docs/guides/self-hosting/docker : minimum/recommended hardware.
- https://supabase.com/docs/guides/storage/buckets/fundamentals : public downloads bypass retrieval controls; private downloads use JWT/RLS or time-limited signed URLs.
- https://supabase.com/docs/reference/javascript/storage-from-createsignedurl : client reference, fetched page was broad rather than a focused method extract; actual call shape also checked against installed typed SDK during TypeScript validation.

Requested decision: approve creation of ONE USD 0 isolated Free staging project only after account eligibility is verified, synthetic fixtures and side-effect stubs only, no production changes, paid fallback or mobile release. If Free unavailable, stop and return the blocker. Production approval remains a separate later decision.
