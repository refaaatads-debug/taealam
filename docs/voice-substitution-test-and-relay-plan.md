> CURRENT POLICY UPDATE13:39: daily allowance is300seconds/account/Riyadh day, shared web connected time and newly generated mobile TTS. Provider max299seconds, reservation300. Earlier900second/three-session text below is historical and superseded. No eligibility expansion, deployment or paid test approval.

# Offline substitution test plan and relay fallback

Status: awaiting explicit approval. Do not execute. No current permission for more connections.

## Proposed negative checks

Use only existing owner-controlled proof and production agent IDs, no student data. Never change provider config, production routes or database. A successful handshake may cost money. Each vector gets one fresh single-use signed ticket for the isolated299sec agent, one connection attempt, no retry.

1. URL branch substitution: replace only branch_id with old agent's600sec Main branch, keeping isolated agent_id, conversation_id and signature. Omit client branch. If accepted, immediately close and later read actual resolved agent/version/branch. Rejecting before acceptance supports this vector only.
2. Client initiation branch substitution: unmodified legitimate isolated-agent signed URL, but client initiation includes old600sec Main branch. Immediate close on initiation metadata; authenticated record identifies actual resolution.
3. URL agent substitution: replace only agent_id with old production agent ID, retaining isolated branch and signature. This checks signature principal binding. Immediate close on initiation metadata.

Independent hard10sec abort per attempt, outer process45sec for all. Start stopwatch before WebSocket handshake, not after. No input audio, no user text, no overrides or dynamic variables containing people. On any accepted mismatch or missing resolved-route evidence, mark overall gate FAILED/UNRESOLVED. Stop later checks on a confirmed bypass. No repeated attempt if transport fails. Provider GET reads only after each attempt to determine terminal route/cost. Redact signatures and never store URLs in logs. Record per-case status, handshake code, elapsed, accepted metadata boolean, resolved IDs, termination and fiat cost. Verify original production version unchanged afterwards.

## Budget

Proposed authorization ceiling SAR1total, not an exact prediction. Use measured call total0.361319USD/300seconds only as an orientation, not a short-call price guarantee. Public burst base0.16USD/min means30sec is0.08USD before LLM/initial speech; configured model estimate adds around0.006USD for30sec, but startup can differ. Stop if provider tariff/rate or accumulated cost puts the remaining cases outside approval. Never claim handshake rejection is free until usage confirms. If cost is unavailable, do not continue into further potentially billed cases under uncertainty.

## Relay fallback, offline design only

- Browser authenticates through existing app session and requests voice start as now.
- Existing service-role gate checks eligibility, isolated agent branch/security config and reserves300seconds. Create a short-lived high-entropy single-use local handle bound to user/reservation, stored hashed, consumed atomically at relay upgrade. No provider URL/signature returned.
- Relay alone mints and opens the provider socket with fixed agent/version/main branch. Bind provider conversation ID before allowing audio flow. Fail closed and retain reservation after ambiguous mint/connect failure.
- On first client initiation, construct a new allowlisted object. Preserve only controlled student dynamic values from authenticated profile and allowed source metadata. Never forward client branch_id, agent_id, version_id, environment, workflow/procedure fields, conversation_config_override, custom_llm_extra_body or arbitrary dynamic variables. Later initiation messages are rejected.
- Forward only schema-checked, bounded user_audio_chunk, pong/event IDs and a narrow supported-interruption protocol. Reject unknown client event types and oversized/burst payloads. Never let upstream error bodies/URLs leak to browser.
- Relay upstream event stream needed by current SDK; test audio ordering, ping/pong, buffering/backpressure, interruption, close/error propagation and meter behavior against a local fake provider. No model/provider requests in these tests.
- Independent relay clock closes both sockets no later than299seconds. Provider299max remains defense in depth. On client disconnect, close upstream immediately. On crash/timeout, reservations remain conservative; private reconcile uses authenticated provider duration. Keep900daily cap and Riyadh day unchanged.
- Isolate process from the25second chat runtime path. Validate actual VPS proxy WebSocket timeout, concurrency/resource caps, logging redaction and deployment rollback offline before any release. No new external service or paid hosting without approval.
- Existing direct signed-URL endpoint must stop returning upstream credentials when relay activates. Otherwise users could still bypass it. This transport switch needs explicit publishing approval and a separately authorized real-session compatibility check; offline tests alone do not prove real audio works.
