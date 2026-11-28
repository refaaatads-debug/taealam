// Teacher voice-silence clock. Silence time accumulates only while the rule can measure it.
// Harmless gaps (student briefly absent, short link problem) PAUSE the clock. A muted teacher microphone is NOT a gap: it counts as silence.
// Only the teacher speaking resets it.

export const TEACHER_SILENCE_WARN_SECONDS = 240;
export const TEACHER_SILENCE_VIOLATION_SECONDS = 300;
// A single tick never adds more than this. Browsers throttle timers in hidden tabs to about one tick a minute,
// so the cap is above that and a hidden tab still counts real time. A laptop sleep adds at most this much once.
export const TEACHER_SILENCE_MAX_TICK_MS = 65_000;

export interface SilenceClock {
  silentMs: number;
  lastTickAt: number | null;
}

export const initialSilenceClock = (): SilenceClock => ({ silentMs: 0, lastTickAt: null });

export function advanceSilenceClock(
  clock: SilenceClock,
  input: { now: number; measurable: boolean; teacherSpeaking: boolean },
): SilenceClock {
  if (input.teacherSpeaking) return { silentMs: 0, lastTickAt: input.now };
  if (!input.measurable) return { silentMs: clock.silentMs, lastTickAt: input.now };
  const elapsed = clock.lastTickAt === null ? 0 : input.now - clock.lastTickAt;
  const delta = Math.min(Math.max(0, elapsed), TEACHER_SILENCE_MAX_TICK_MS);
  return { silentMs: clock.silentMs + delta, lastTickAt: input.now };
}

export const silentSeconds = (clock: SilenceClock): number => Math.floor(clock.silentMs / 1000);

// ─── Keep the clock across a page reload (sessionStorage) ───
// Only the silent time is kept. The time the page was away is not counted (the clock restarts ticking after the reload).
export const silenceStorageKey = (bookingId: string): string => `teacher_silence_ms_${bookingId}`;

export const restoreSilentMs = (raw: string | null | undefined): number => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Never trust more than the violation window; the server re-checks the duration anyway.
  return Math.min(n, 10 * 60 * 1000);
};

export const restoreSilenceClock = (raw: string | null | undefined): SilenceClock => ({
  silentMs: restoreSilentMs(raw),
  lastTickAt: null,
});
