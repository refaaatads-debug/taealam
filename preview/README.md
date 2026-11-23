# Voice tutor visual preview

Preview-only change. Do not merge or deploy until Mohamed explicitly approves.

## Scope

- `LiveVoiceTutor.tsx`: replaces presentation with the shared Arabic RTL panel, adds latest user/assistant text from SDK messages, and passes the local output meter.
- `VoiceTutorPanel.tsx` / `.css`: reference-style green sphere, pale halo, heading, status and transcript cards. The sphere samples `getOutputVolume()` with requestAnimationFrame only while speaking. No looping fake pulse. Zero/invalid/unavailable readings do not create motion. Cleanup resets on stop/unmount. Reduced-motion preference suppresses movement.
- `VoiceTutorPanel.test.tsx`: mocked local meter and lifecycle tests.
- `preview/voice-tutor.html` / `.tsx`: dev-only fixture with sample content. Imports no provider, backend client or microphone API. It does not enter the production Vite entry graph. The example uses a zero meter, so it remains still in silence.
- `preview/capture.mjs`: local screenshot runner. Uses installed Chrome; change executablePath if needed.

No backend, auth, entitlement, daily-cap, dependency, migration, deployment workflow or mobile app files changed. Existing start/end/retry controls and premium restrictions remain in LiveVoiceTutor.

## Local checks

- TypeScript: passed.
- Unit tests: 42 files, 223 tests passed, including 4 new tests.
- New panel/test lint: passed.
- Local Chrome: inspected 390px mobile and 1280px desktop screenshots, Arabic RTL and no horizontal overflow.
- Full production build: default Node heap exhausted. A larger heap attempt reached chunk rendering but did not finish within the run limit. This is NOT a verified production build.
- No paid session was started. Real provider audio synchronization still needs an explicitly authorized real-session check before release. Tests cover sampled meter response without provider usage.

## Run visual example

```sh
npm ci --ignore-scripts
npm run dev -- --host 127.0.0.1 --port 4177
# Open http://127.0.0.1:4177/preview/voice-tutor.html
node preview/capture.mjs
```

## Integration note

Built from main commit `131f4d25c1a9c8a5011ab9bc1d44b1df00d96b3c`. Apply to a separate preview branch. The concurrent cap worker changes LiveVoiceTutor session logic, so reconcile only the presentation import/return and onMessage additions when combining later. Do not overwrite that worker's session/auth/cap code.
