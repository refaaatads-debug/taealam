# Controlled cutoff proof, 2026-11-23

One owner-approved call and one tiny TTS request. No retries. Production remains unchanged. Publishing held.

## Result

- Isolated zero-traffic branch from existing production version, changing only maximum duration600 to300seconds.
- Test version: agtvrsn_4201m83xem3df03stkz565ygc72b.
- Conversation: conv_5401m83xfqxpf2trxy8dt7b1xkar.
- Client measured300.159seconds.315second watchdog did not fire.
- Authenticated provider GET returned done, expected agent/version/branch, maximum-duration termination.
- Provider metadata call_duration_secs=301. Provider voice quantity5.002641476015561minutes=300.1584885609seconds.
- Provider cost3599credits, total fiat0.35999409173437075USD including0.02648466USD model use. Nonburst. Actual model usage was qwen35-397b-a17b despite configured glm-45-air-fp8, do not mistake configured-model estimate for invoice evidence.
- Tiny TTS response:2credits, MP3mono44100Hz128kbps,14253bytes,0.862041sec by ffprobe. Staged strict MP3 parser measures1second conservatively.
- Total3601credits. TTS fiat price unavailable in response; do not report a fabricated exact fiat total.

## Failed release gate

Provider cutoff works, but a nominal300sec maximum produces300.158sec billed connection, rounded to301metadata seconds. Existing strict300sec hold would count overrun and trip the global breaker. Precise charging quantity still rounds conservatively to301whole seconds. It does not solve this mismatch.

Three full nominal300sec sessions are over900actual seconds. Reserving301whole seconds safely means only two full fixed-duration sessions can be issued, leaving298seconds for TTS, not a third300sec ticket. Rounding/clipping usage down to300would violate the promised conservative accounting and hide real usage.

No change to the approved product policy has been made. Pending decision: safe full-session reservation/closing tolerance versus separately approved lower provider maximum or a server-controlled proxy. No new paid proof is authorized. Current disabled cap must not be activated as-is.

## Evidence and rollback

Private evidence and original provider config are held on the VPS in /root/backups/voice-cutoff-proof-20261123-095800/. The test used only the isolated branch, no production agent/default-version change. Its rollback.sh is a no-op documenting that boundary. Do not erase the branch/evidence before review.

Prepared production backup/rollback script is scripts/deploy-shared-voice-cap.sh, not run. It takes a full database dump, copies every scoped function file, installs rollback before migration, preserves the locked audit ledger on rollback, and never changes SSH/authentication. Activation remains disabled in source.

Sources:
- https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get
- https://elevenlabs.io/docs/eleven-agents/api-reference/agents/branches/create
- https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-signed-url
- https://elevenlabs.io/pricing/agents
