# Option A runtime release
24 November 2026. Authorized runtime-only, no SQL/functions/storage policy/bucket changes.

This separate branch retains combined source reconciliation and account read-error fail-closed protection. It defers the signed attachment view rollout because existing storage SELECT policies do not authorize every certificate/withdrawal/AI-support owner path. Production attachment access remains as it was; public bucket exposure is NOT fixed by this release. Signed-view work remains in draft PR34 for a later coordinated privacy cutover.

API notification media filtering from PR37 may be included: it prevents private/signed bearer links from becoming public push derivatives, no provider delivery is triggered by the release itself. No mobile release or source changes. No main merge or broad workflow. Current production database and mounted functions must remain byte/config unchanged. Full verified backup before apply, frontend index last, API restart only if needed, public checks and rollback on failed check. Authenticated DB-writing tests remain excluded.
