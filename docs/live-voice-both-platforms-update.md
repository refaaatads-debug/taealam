# Both-platform scope update, 2026-11-23

Owner accepted five-minute live sessions, Riyadh day, proposed two-table/three-RPC DB scope, and requested both web and mobile instead of live-web-only. No production migration/provider switch/paid cutoff test is authorized in this phase. This replaces the live-only scope assumption in the earlier design, not the release gates.

## Important unresolved meaning

Mobile uploads a recording, receives text plus an MP3 reply, can replay a saved reply, and can fall back to device speech. A server-only ledger can share900seconds between live connected time and **newly generated TTS duration**. It cannot count offline/repeated playback or device speech accurately. The proposed shared allowance counts neither mobile recording time nor transcription usage. Clarify that product rule before production; do not present it as a full listening-time limit.

TTS has no verified per-request hard maximum-duration input. It is billed on generation, not listening. Measuring audio and withholding output that exceeds a reservation can cap delivered audio and stop subsequent paid requests, but cannot undo generation cost already incurred. A generated-audio overrun opens a global fail-closed breaker until investigated. This is not a guarantee that a single TTS request cannot exceed a monetary/seconds budget. No15min spending guarantee should be made.

## Server-only prototype

The same2tables and3RPCs remain, with reservation kind `live`/`tts` and variable held seconds1..300. Live always reserves300 and retains its provider cutoff requirement. TTS reserves up to300 or the smaller remaining daily allowance, shares the same account/day lock and uses a server-generated operation ID. Only one outstanding operation is allowed across both platforms. Text chat should continue when paid voice is exhausted; no prepaid subscription minutes are mutated.

`tts-daily-budget-preview.ts` binds before generation, counts MPEG1LayerIII128kbps/44100Hz stereo full frames from the server-returned MP3, rounds up sample duration, settles before audio delivery and rejects unexpected/truncated audio. It preserves the existing MP3 response format, avoiding unproven WAV playback changes. Failure/ambiguity keeps the hold. Provider audio larger than reserved is counted in full and withheld. A generated local3.2sec stereo128k MP3 measures4seconds as expected. Synthetic parser/budget unit tests pass. No vendor TTS request was sent.

The helper is not yet integrated into the actual deployed `ai-tutor-chat` source. That source has earlier live-only premium patches not merged into webmain; retrieve and preserve that exact source when preparing integration, do not overwrite it with stale main. Server-only integration can preserve response `{text,audio}` with `audio:null` when exhausted, so no OTA is required for cost-control mechanics. A correct remaining-time/exhaustion banner and disabling mobile device-speech fallback would need an independently approved mobile change. Without that change device speech may still read text aloud, though it does not spend ElevenLabs credits.

## Work verified off production

- Deno2.2.7 type/dependency check passed for preview endpoint and TTS helper.
-60 unit tests pass across stage1, live daily gate, reconcile worker and TTS helper.
-31 isolated SQL assertions pass including shared TTS/web allowance and persistent overrun breaker.
-Actual local PostgreSQL18.7:32 parallel connections x3reservation rounds,32denials at exhaustion,32duplicate settlements; exactly900held and one refund. The same stress test then passed on local PostgreSQL15.20, matching the production15.x major version (production15.8).
-Production read-only check: existing immutable provider version exists; auth true;600sec max; duration override false. Proposed cap tables absent.

Still blocked from release by product meaning, actual chat integration/reconcile scheduler,  provider version pinning/cutoff proof and separately approved paid cutoff test. No main merge, DB migration, provider switch, OTA or paid generation done.

Sources: https://elevenlabs.io/docs/api-reference/text-to-speech/convert and https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps . Both list output formats and generation payloads, neither establishes a hard audio-duration input cap.
