# Voice branch binding options, 2026-11-23

Question: close the client branch-substitution gap without further paid calls. Production held. Keep299provider max and300reservation unchanged.

## Recommendation

A server-owned WebSocket relay gives the clearest design-level guarantee: no upstream URL/signature reaches the browser; server fixes route and strips route-changing initiation fields. This is a new transport implementation requiring offline abuse/protocol tests and eventual authorized real compatibility verification. It adds server bandwidth, latency and operational responsibility. Preparing it need not consume provider credits, but it is not zero-cost operation.

Written vendor assurance about agent/branch/version binding could allow current direct transport without a charge. Existing public documentation does not state the required binding, while it does document client branch selection. No vendor outreach authorized or sent.

Archiving old branches cannot close this: old600sec branch is Main, which cannot be archived/deleted, and old versions are immutable. Updating Main creates a new version rather than erasing history. Disabling the old agent would disrupt production and still does not prove signatures bind the new agent.

Negative connection checks are an empirical option, not the only route. Exact cost cannot be promised in advance. Proposed narrow scope, if separately approved: up to3route-substitution vectors, no speech, immediate close on metadata, independent10sec watchdog each, no retries, totalSAR1ceiling subject to confirming rates fit. Current authorization does not cover these tests, so none run.

## Sources and confidence

- ElevenLabs authentication, official: https://elevenlabs.io/docs/eleven-agents/customization/authentication . Establishes signed URLs and15minute validity, not branch binding. High confidence.
- Personalization, official: https://elevenlabs.io/docs/eleven-agents/customization/personalization . Client initiation can include branch_id. High confidence.
- Signed URL API, official: https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-signed-url . Agent/version/branch selectors; single-use conversation ID. High confidence.
- Versioning, official: https://elevenlabs.io/docs/eleven-agents/operate/versioning . Main cannot archive/delete, immutable versions. High confidence.
- Duplicate API, official: https://elevenlabs.io/docs/eleven-agents/api-reference/agents/duplicate . Copies unarchived branches, unsuitable for removing legacy unsafe variants. High confidence.
- ElevenLabs transport, official: https://elevenlabs.io/docs/eleven-agents/libraries/web-sockets . Audio/event transport details. High confidence.
- Deno API, primary technical reference: https://docs.deno.com/api/deno/websockets/ . Server upgrade and sockets support a relay. High confidence.
- Public SDK issue: https://github.com/elevenlabs/packages/issues/452 . Branch use with authenticated WebSocket; does not establish security binding. Community/vendor-maintained issue, supporting only.
- Controlled live evidence: foreign branch GET404but mint200returns foreign branch in URL; no foreign-route connection attempted. Cutoff proof succeeds for intended route. Source: private proof files on VPS, summarized in PR28docs. High confidence for observations, no inference of bypass or safety.

Only two public source categories were relevant and available, vendor/primary technical documentation and a public SDK issue. No source establishes the missing guarantee.
