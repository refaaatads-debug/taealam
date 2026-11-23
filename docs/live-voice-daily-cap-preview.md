> CURRENT POLICY UPDATE13:39: daily allowance is300seconds/account/Riyadh day, shared web connected time and newly generated mobile TTS. Provider max299seconds, reservation300. Earlier900second/three-session text below is historical and superseded. No eligibility expansion, deployment or paid test approval.

# Live voice daily cap: preview, not deployed

## Status and proposed product rule

This is a tested prototype plus SQL migration, not an operational cap. Production is unchanged by this PR. The proposed rule is 900 seconds of ElevenLabs **live-agent connected time per authenticated account per Riyadh calendar day**, one outstanding ticket/call per user. It does not cover mobile's separate AI chat, transcription or text-to-speech spending. Extending the rule to those products requires a separate design and approval.

Sessions in this proposal are at most **300 seconds (5 minutes)**, not the existing 600. This is a product choice needing review, not an implied approval. Three fully used sessions exhaust 15 minutes. Shorter finished sessions refund only verified unused seconds. A balance smaller than 300 remaining cannot start another session, so the prototype can conservatively leave up to 299 seconds unusable that day. No prepaid subscription minutes are deducted by this migration; that accounting remains a separate policy/integration question.

## Why fixed provider-enforced duration

Signed URLs expire for starting a call, not for stopping it. Browser timers, disconnect callbacks and client-reported usage can be bypassed. An LLM end-call instruction is not a hard timer. The current initiation webhook explicitly does not run for SDK/widget calls; remote monitoring/end-call is enterprise-only.

Use a separately approved immutable provider version with a fixed300-second maximum, auth required, duration override disabled and prompt override disabled. The server checks the exact pinned version before every reservation, requests its version_id explicitly and asks for a single-use conversation ID. No provider version/config is created by this PR. A signed URL is never returned unless its conversation ID is atomically bound to the private reservation. Only the server chooses identity/version; request bodies supply neither.

This reduces flexibility versus dynamic per-call duration but avoids a server proxy carrying all audio or an enterprise monitoring dependency. Provider enforcement at a real cutoff has NOT been tested here because no paid conversation was authorized. Version pinning, client inability to alter it and the duration override lock are mandatory validation gates, not assumptions that unit tests prove.

## Files and boundaries

- `supabase/migrations/20261123_live_voice_daily_preview.sql`: private RLS tables, service-role-only reservation/binding/settlement RPCs. Not applied.
- `supabase/functions/_shared/live-voice-daily-preview.ts`: dependency-injected issuance/reconciliation logic.
- `supabase/functions/ai-tutor-token-daily-preview/index.ts`: opt-in disabled preview endpoint adapter. Not deployed, not referenced by the existing endpoint/client.
- `src/test/liveVoiceDailyPreview.test.ts`:22 mocked provider/service tests. Along with stage1 tests,43 pass.
- `scripts/voice-cap-sql/test.mjs`: isolated PGlite SQL assertions for cap, holds, refunds, duplicate settlement, independent users, privacy, privilege and local-midnight guard. This is not multi-connection lock stress.

## Reservation and failure semantics

1. Validate existing user session with auth.getUser. Do not trust a supplied UUID.
2. Validate pinned provider config, then call reserve RPC. RPC rechecks active/nondeleted profile, a role and premium positive prepaid balance.
3. Lock `(user, Riyadh day)` row; reserve300 seconds only if outstanding call/ticket absent and total held/used plus300 <=900. No more than one account can consume the same remaining allowance via parallel requests.
4. Reserve before minting the provider ticket. Bind returned conversation ID before revealing URL. Binding must occur within10seconds of reservation creation; late tickets are never returned. The20min10sec hold includes that issuance window. Timeout/ambiguous failure never refunds a possibly usable ticket.
5. Ticket can start within15min; provider maximum300sec then ends it. Keep concurrency hold20min10sec from reservation. Refuse new starts during the final20min10sec of the local day, avoiding cross-midnight undercount. This downtime is deliberate and needs UX approval.
6. Hold remains a budget debit after concurrency timeout. Only provider-authenticated terminal duration settlement refunds unused allowance. Missing event/reconciliation means conservative lost allowance, not free calls.
7. Terminal reconciliation reads provider GET with the server API key, checks conversation/agent/version, accepts only done/failed with nonnegative integer duration. Unknown IDs, active calls, wrong version and malformed duration cannot refund.
8. Settlement is row-locked and idempotent by unique conversation ID. Overrun is charged in full, never clipped to300, and reports a provider-overrun flag. A production adapter must alert and disable new issuance when any overrun occurs; it cannot retroactively make an overrun impossible.

No automatic cleanup erases outstanding/ambiguous debits. Administrative reconciliation must inspect provider evidence and preserve audit. Anonymous/client roles have no table privileges or RPC execute grants. No email, phone, signed URL, JWT or provider key is stored in the ledger.

## Reconciliation deployment still required

A service-authenticated job must periodically fetch terminal details for issued reservations and call reconcileCappedVoice. A signed post-call webhook may wake it sooner, but raw webhook duration is never accepted by this prototype. If adding a webhook, verify ElevenLabs HMAC against raw body and timestamp with replay protection before scheduling a read. Unknown conversation IDs must not trigger arbitrary provider retrieval. Do not deploy an unauthenticated settlement HTTP endpoint. Scheduling, secret setup and rollout are not implemented/applied here.

## Required gates before requesting production GO

1. Confirm Riyadh day policy, scope (live agent only), 5min sessions, conservative partial allowance and midnight downtime.
2. Backup DB schema/data and provider configuration; obtain separate migration/config/endpoint release GO.
3. Create approved immutable300sec provider version without enabling irreversible workspace versioning blindly. Verify auth/override settings on the exact version and authenticate API-key access.
4. Prove version pinning cannot be changed by client initialization fields, and verify paid provider termination <=300sec with an explicitly approved capped test. Until then do not claim a hard cap.
5. Run SQL on staging real Postgres with parallel multi-connection stress, plus crash-between-reserve/mint/bind, retries, midnight and duplicate out-of-order events. Run Deno adapter type/dependency check.
6. Implement/authenticate reconciliation job and overrun circuit breaker, monitor its failures, and test both recovery and cancellation paths. PGlite serializes its own queries and cannot establish real lock behavior under contention.
7. Switch existing web token route to adapter behind a default-off feature flag. Close any older unlimited token route for that same agent; otherwise users can bypass this feature. No mobile OTA needed for live-agent path, but mobile TTS remains outside this cap.
8. Non-chargeable valid/invalid account checks first; only separately approved paid cutoff test after that. Never market client timer as enforcement.

## Rollback

Before rollout, no rollback is needed because nothing is installed. For eventual rollout, disable new capped issuance first and do NOT fall back to unlimited issuance automatically. Keep provider300sec version and ledger until every issued ticket expires/call terminates and settlement finishes. Restore prior endpoint/provider only under explicit authority because that reopens the former cost policy. Do not drop tables while active holds exist. A down migration must archive/retain ledger evidence, revoke RPCs then drop RPCs/tables only after reconciliation; no destructive down migration is auto-run by this preview.

## Sources checked 2026-11-23

- Signed URL and single-use conversation IDs: https://elevenlabs.io/docs/api-reference/conversations/get-signed-url
-15min start validity, not call cutoff: https://elevenlabs.io/docs/eleven-agents/customization/authentication
- Provider max60..7200sec, current default600: https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow
- SDK initiation webhook exclusion: https://elevenlabs.io/docs/eleven-agents/customization/personalization
- Remote call controls enterprise-only: https://elevenlabs.io/docs/eleven-agents/guides/realtime-monitoring
- Immutable versions and irreversible enablement caveat: https://elevenlabs.io/docs/eleven-agents/operate/versioning
- Provider GET version selection: https://elevenlabs.io/docs/eleven-agents/api-reference/agents/get
- Webhook authentication/delivery: https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks
