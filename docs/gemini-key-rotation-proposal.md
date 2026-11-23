# Proposed shared Gemini key rotation, not authorized to execute

23 November 2026. Owner selected one NEW key for all Gemini consumers. This is not approval to install it. No secret value is in this document.

## Exact source and blast radius

Read-only Docker inspection confirms Compose project directory `/root/taealam/supabase_setup/docker`, file `docker-compose.yml`, service `functions` (container `supabase-edge-functions`). Persistent source is `.env` in that directory. Compose maps `GEMINI_API_KEY: ${GEMINI_API_KEY}` into the functions container. Runtime provider config is enabled and currently sources the environment, not a provider-vault key. No `GEMINI_MODEL` override is present.

Live consumers of this resolver are: `sanad-public`, `ai-tutor`, `live-ai-assistant`, `ai-tutor-chat`, `ai-support`, `teacher-ai-summary`, `student-ai-summary`, `extract-questions-from-file`, `admin-analytics-insights`, `grade-assignment`, `session-report`, `analyze-violations`, `help-bot`, `solve-homework`, `twilio-media-stream`, `teacher-performance-report`. Some are fallbacks, not always the active provider. Rotating this shared secret affects all sixteen, not just the named three. Future Gemini pilot uses the same resolver but remains undeployed/disabled.

## Blocking decision before change

Google Developer API terms currently prohibit clients directed toward or likely accessed by under-18s. This also affects the already-live student-facing integrations, not just Live voice. A new key, paid tier or system prompt does not remove the restriction. Verify a suitable Google product/contract and data policy before continuing student use or rotating for expanded use. Do not silently disable existing production features in this preparation. Source: https://ai.google.dev/gemini-api/terms

## Exact proposed operation after explicit approval

1. Confirm the new key's Google project, model access, billing tier, allowed API restriction and any IP restrictions. Do not infer paid data terms from the presence of a key. Obtain separate permission for any billed validation. No production key replacement during validation.
2. Create a timestamped root-only release backup directory outside the repository. Preserve the current `.env` with mode 600 and current Compose file/config hashes. This backup contains secrets: do not print, attach, commit or send it. Record only file hashes, permissions and secret-name presence in evidence. Verify backup can be read privately by the restore process and that the old value exists without displaying it. Keep old key active at Google during rollout.
3. Transfer the new saved key through a protected temporary secret file, never command-line arguments/output. Programmatically replace ONLY the `GEMINI_API_KEY` value in `.env`, validating exactly one expected assignment and preserving all other entries. Atomic same-filesystem replace; mode 600; no debug logs. Delete temporary secret copy after success/failure. Do not put the key in Supabase tables or introduce a duplicate provider-vault source in this change.
4. From the confirmed Compose directory, recreate ONLY the `functions` service (`docker compose up -d --no-deps --force-recreate functions`). A plain container restart does not load a changed Compose environment. Do not restart Postgres, auth, nginx, realtime or other services. This restarts all edge functions briefly, not just Gemini routes; expect a short readiness window.
5. Bounded readiness: anonymous protected route must return expected 401 (not 502), non-Gemini basic health passes, auth behavior remains unchanged. Verify the running container key matches the new protected file by a boolean comparison, never printing values. Verify all unrelated environment/config bytes match backup except intended metadata.
6. With an approved adult/synthetic test scope and tiny spend cap, test each distinct Gemini request path: Sanad, ai-tutor, live-ai-assistant; Gemini fallback for ai-support and ai-tutor-chat without deliberately exhausting Groq; and each remaining consumer's request shape in an isolated fixture. Do not invoke grading, reports, Twilio calls or homework mutations against real records as a health check. For routes with side effects, use isolated dependencies/fixtures instead. Verify selected model, HTTP success, expected schema/Arabic content, no secrets in response/logs, auth and rate-limit denial. This validation may require code fixtures first and is not yet run. Existing voice remains ElevenLabs; do not start a voice call or enable Gemini pilot as part of key rotation.
7. Compare failure counts and expected baseline logs for a bounded period. Do not claim all sixteen verified if only the main three were exercised. Report exact tests, caveats and restart times. Keep rollback backup until owner accepts.

## Rollback

On failures, atomically restore the saved `.env`, recreate only `functions` again, then repeat readiness and approved read/test checks. Compare restored file hash and running-key boolean to backup without displaying the key. This returns the previous key and keeps all application code, provider routing, database and daily cap ledger unchanged. Do not revoke either key until accepted and independently approved; revoking the old key early would make rollback impossible. Key rotation rollback is separate from the old full voice/backend/web rollback script.

## What approval must cover

Confirm terms/product eligibility, all-sixteen-consumer blast radius, exact secret-only change, brief whole-edge-function restart, bounded synthetic validation cost, backup retention and rollback. No deployment of Gemini voice, no web/orb release, no mobile update, no model switch and no student data test are included. If any of these change, ask again.

## Current verification status

Persistent path, Compose mapping, active source and consumer list verified read-only. New key has been saved securely but not read, used, installed, compared or tested. New project's spend, quotas, tier, restrictions and access remain unknown. The existing key remains live. This document is a proposed runbook, not a tested production rotation/rollback.
