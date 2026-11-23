# Gemini Live migration preparation

23 November 2026. DRAFT, NOT DEPLOYABLE. No production file, key, provider setting or database was changed for this preparation.

## Decision

Prepare an adult, synthetic-data voice pilot using `gemini-3.8-live`. Keep ElevenLabs untouched until an exact release is approved. The new route is additive and disabled; nothing imports the browser adapter into a live page. This branch is based on the existing shared-cap/orb preparation branch, not main. Review its incremental diff against `preview/voice-cap-and-orb`.

**Student rollout is blocked.** Google's Gemini Developer API terms prohibit API clients directed toward or likely accessed by under-18s. Paying for this API does not remove that condition. Ajyal is a student platform. An adult tester allowlist on its own does not prove the platform meets these terms. Confirm a suitable Google Cloud/education product and contract, with its own terms, or use a genuinely separate permitted adult test environment before any hosted pilot. The current branch is offline preparation, not permission to operate this API on Ajyal.

## What is implemented

- New `gemini-live-pilot` function, not deployed or configured in production. Explicit enable, cutoff-verification and adult-test-only acknowledgments, plus nonempty tester-ID allowlist. Every gate defaults closed.
- Authenticated user is derived server-side, not from request JSON. Active, nondeleted student role and active professional/premium prepaid subscription with a positive finite minute balance are required.
- Reuses the existing service-only atomic `reserve_live_voice` RPC and Riyadh-day shared ledger. Gemini, old ElevenLabs live and newly generated mobile TTS cannot independently spend a fresh daily allowance.
- Full 300-second reservation before minting. Failed/ambiguous minting keeps its debit. No client timing refund, no new refund endpoint, no client access to ledger tables. Gemini rows remain reserved, without an ElevenLabs conversation ID, so the existing ElevenLabs reconciler does not touch them.
- Ephemeral credentials: one use, at most 60 seconds to start, absolute expiry 300 seconds from issuance, server-locked model and Arabic instruction. No session resumption, tools, grounding, video or cross-session history in this pilot.
- Uses existing `getProviderApiKey('gemini', 'GEMINI_API_KEY')`, honoring the owner's one-key preference. The long-lived key never reaches web/mobile code. Browser receives only an ephemeral credential and deadlines with no-store headers.
- Local development-only browser entry now wires microphone AudioWorklet capture to mono 16kHz PCM, 24kHz queued playback, interruption flush, real output-level orb, mute, end, visibility/pagehide cleanup and absolute deadline. It is excluded from production build inputs and App routes. Signed-out/consent UI checks, mocked session lifecycle and fake-device browser audio tests pass. Real provider interoperability and physical-device testing remain unverified.
- Pinned `@google/genai` 3.6.1. Sixteen offline pilot/PCM/lifecycle tests, plus existing cap/access tests, 62 total. Rollback preparation script refuses to change production and includes a local file-restore rehearsal only.

## Enforcement caveats and release gates

`expireTime` is documented as the time after which messages are rejected; Google may close the session after it. This is stronger than a client countdown but is NOT proof that buffered/in-flight generated speech ends exactly at 300 seconds. Before approval, test exact runtime token creation, config substitution, reuse, resumption and messages/audio around expiry with synthetic data and an agreed small cost cap. Do not advertise a hard monetary ceiling.

The token deadline starts at issuance. A user connecting 60 seconds later gets about 240 seconds, not a fresh 300 seconds. This is conservative. Full daily reservation also means an early stop or connection failure consumes the day's voice allowance unless authoritative provider evidence supports a separately reviewed refund design. This is stricter than the old provider-duration settlement and needs owner acceptance before rollout.

The reused SQL currently blocks issuance for the last 20m10s of the Riyadh day, designed for ElevenLabs' 15-minute ticket start window. Keep that conservative rule for now; a provider-specific shorter midnight window needs a separate tested SQL migration. All caps persist during rollback. Existing saved audio and device speech remain outside the generated-audio budget, as previously agreed.

Official guide specifies v1beta ephemeral tokens, while SDK 3.6.1 method comments still mention v1alpha. The draft uses v1beta per current guide. Type checking and mocks do not establish real edge-runtime compatibility. Same-image Supabase worker verification is mandatory. No live Gemini request was made in this preparation.

Arabic is requested in locked system instructions, not guaranteed mathematically. Test refusal/clarification, dialects, language-switch prompts, curriculum accuracy, voice safety and interruption before release. Do not disable provider safety.

## Current site and shared-key decision

Read-only production inspection: Gemini provider is enabled, no model override or provider-vault key; existing secret is `GEMINI_API_KEY` in the server environment. Sanad (`sanad-public`), `live-ai-assistant` and `ai-tutor` use Gemini. Their model resolver prefers `gemini-2.5-flash` then `gemini-2.5-flash-lite` after catalog lookup. Exact last request model is unverified. `ai-support` and `ai-tutor-chat` use Groq first and Gemini as fallback; generated mobile TTS uses ElevenLabs.

The owner prefers one shared Gemini key. Keep that choice, with separate route/model usage metrics. Revocation/rotation and credential failures then affect all Gemini features. Separate keys in one project do NOT isolate project/model quotas or billing. Separate projects are needed for stronger isolation. A shared key also loses key-level feature attribution, but application usage logs can still estimate per-feature cost without storing student audio or transcripts. Existing spend, project identity, tier and active quota remain unverified.

The new key was subsequently installed through the separately approved secret-only rotation at 21:31 Riyadh. A free model-catalog read and key-match/readiness checks passed; no generation test was done. The owner selected and separately approved the shared-key installation. The old key remains active for rollback. See `gemini-key-rotation-proposal.md` for the verified sixteen-consumer blast radius and exact proposed operation. Use a restricted Gemini API key only. During a future approved installation, transfer the saved key through a protected secret path into the server secret store, never a repository, PR, `.env` committed file, command output or chat. Restart/update only the approved services, then verify that Sanad still works. Do not create a second untracked secret copy.

## Privacy and terms

Free-tier inputs/outputs may be used to improve Google's products and processed by human reviewers. Use synthetic data only, no real names, student identifiers, recordings, school files or private conversation history. Paid API content is not used for product improvement under the cited pricing/terms, but retention, lawful basis, parent/guardian requirements, residency, access control and under-18 product eligibility still need review. Do not tell users that paid means zero retention or automatic suitability for children.

## Cost estimate, not a spending guarantee

Current listed Gemini Developer API rates for 3.8 Live: audio input $3/M tokens (page also gives approximately $0.005/min), audio output $12/M ($0.018/min); text input $0.75/M; text output including thinking $4.50/M. No context caching on this model. Search/tools are excluded here.

Five minutes of input plus five minutes of generated output is about $0.115 for those direct audio streams alone, before repeated context, prompt/text tokens, transcripts, taxes and any other usage. With 20 turns and 2,000 repeated instruction tokens, instructions alone add about $0.03 (20 × 2,000 × $0.75/M). History reprocessing can add more, so $0.115 is NOT an all-in five-minute session price or upper bound. A preliminary planning range of $0.15-$0.50/session is an assumption to validate with synthetic-session usage metadata, not a quote or enforceable cap. Do not promise savings from the base rate alone. Keep the prompt short, use no tools, and collect token usage before estimating real monthly spend. Google Cloud's Live billing documentation explicitly describes per-turn reprocessing; confirm the actual Developer API project's usage semantics and invoice.

No per-user monetary budget is implemented. The five-minute rule limits issued voice duration, not token count across adversarial rapid turns. Before real traffic, choose an overall project budget and app-side issuance/turn controls. Google budget alerts are not assumed hard spending stops.

## Mobile impact

Mobile is currently record -> upload/transcribe -> text response -> encoded audio playback, not the ElevenLabs live WebSocket path. See `hooks/useContinuousVoiceConversation.ts`, `lib/aiAnswerAudio.ts` and `lib/speakAiAnswer.ts` in the mobile repo. It expects URL/base64 audio, with MPEG assumption for untyped base64. Gemini Live emits streamed PCM, which cannot be dropped into that field as if it were MP3.

A native migration needs PCM microphone capture (16kHz mono signed PCM), streaming output playback at the provider-declared rate, echo/interrupt handling, Bluetooth/headset/background cleanup, permissions and provider event state mapping. Current expo-audio record-to-file flow is not proof of supported full-duplex PCM streaming. Evaluate native module support on the installed Expo/RN versions; if required, build/review/release a native update, never silently publish OTA. Keep app text, saved replays and device speech working. No mobile file, dependency, OTA, APK or store release changed here.

The isolated development entry replaces the session interface and wires Gemini audio/orb; the normal web route still uses `@elevenlabs/react`. Keep it unchanged until Gemini integration passes approved provider tests and physical-device tests. ElevenLabs TTS in `ai-tutor-chat` must remain until a separately approved mobile audio replacement. A complete ElevenLabs removal is therefore at least two releases, not one key switch.

## Rollout and rollback

1. Resolve under-18/product-contract eligibility. Confirm adult test environment, project identity, restricted key, paid/free data treatment and synthetic test scope.
2. Owner approves a small explicit test spend. Verify token minting/config locks in the exact edge runtime, then one bounded audio pilot and cutoff/reuse/overrun tests. None done yet.
3. Browser pipeline and local UX harness are prepared; complete real-device and approved provider tests, then approve exact branch/commit, deployment scope, backup and adult tester account.
4. Capture current backend/web/config hashes and a nonsecret secret-name inventory. Rehearse exact scoped rollback on copied files before deploy. Current script is only a plan/local file rehearsal, not this release rollback.
5. Deploy additive adult pilot with allowlist only when approved and legally suitable; do not reroute Sanad, change text models or automatically replace the shared key.
6. Only after accepted evidence, separately approve production student-compatible architecture, privacy and mobile migration.

Rollback: first disable new Gemini issuance, then wait at least token expiry plus margin before enabling another provider, preventing overlapping live tickets. Restore captured pre-release web/functions and routing; preserve all daily ledger debits and evidence. Do not use the old full pre-cap rollback blindly. Do not revoke/replace the shared Gemini key because Sanad depends on it. ElevenLabs may remain unavailable from exhausted credits, so restoring its code does not guarantee restored service. Text mode is the safe fallback. If a new native build exists later, disable its Gemini route server-side; mobile release/rollback still requires separate approval.

## Decisions needed from Mohamed

- Accept adult/synthetic-data-only offline preparation and resolve the under-18 product/contract issue before any hosted rollout.
- Confirm the shared key's Google project and whether billing/paid data treatment is enabled. No charge or upgrade is approved by this plan.
- Accept or change conservative full-day debit after a failed/short session and the shorter-than-5-minute session after delayed start.
- Approve a specific small cost cap for future runtime/cutoff testing. Preparation itself used no Gemini generation.
- Later approve exact web/backend change and commit. Mobile is a separate project step and release approval.

## Sources checked 23 November 2026

- Model and no caching: https://aistudio.google.com/docs/models/gemini-3.8-live
- Ephemeral flow, uses/deadlines/config locking: https://aistudio.google.com/docs/live-api/ephemeral-tokens
- Exact expiry semantics: https://ai.google.dev/api/live
- Model capabilities and unsupported legacy flags: https://aistudio.google.com/docs/live-api/capabilities
- Developer API rates and paid/free data distinction: https://aistudio.google.com/docs/pricing
- Under-18 and unpaid-data terms: https://ai.google.dev/gemini-api/terms
- Restricted API key requirements: https://ai.google.dev/gemini-api/docs/api-key
- Per-project quotas: https://ai.google.dev/gemini-api/docs/rate-limits?authuser=0
- Cloud Live per-turn billing context, not a substitute for Developer API account verification: https://cloud.google.com/model-garden/pricing

## Local preview, 22:45 update

Run `npm run dev -- --host 127.0.0.1`, then open `/gemini-adult-pilot.html` locally. This dev-only entry is not in App navigation or production build output. It requires an existing authenticated session and server allowlist/gates, which remain disabled/undeployed. The checkbox is an acknowledgement, not proof of adult eligibility or payment permission. Do not enable it for a child-directed deployment.

Offline evidence: `node scripts/capture-gemini-pilot.mjs` captures mobile/desktop UI with external networking blocked; `node scripts/test-gemini-audio-offline.mjs` uses Chromium fake microphone and a synthetic tone to verify capture/resampling, mute-no-send, actual output meter, interruption queue flush and ended microphone tracks. No provider call, speech generation or student audio is used. Local preview screenshots show idle UI and signed-out denial, not a Gemini conversation. Output transcription is requested for visual text tracking and adds text-token cost.
