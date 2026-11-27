// Teacher voice-silence clock. Silence time accumulates only while the rule can measure it.
// Harmless gaps (student briefly absent, short link problem, teacher mic muted) PAUSE the clock.
// Only the teacher speaking resets it.

export const TEACHER_SILENCE_WARN_SECONDS = 240;
export const TEACHER_SILENCE_VIOLATION_SECONDS = 300;
// A single tick never adds more than this, so a throttled background timer cannot jump the clock.
export const TEACHER_SILENCE_MAX_TICK_MS = 5000;

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
