// Sanad (live assistant) signals: voice-based silence, summary content check, toast rate limit.

import { TEACHER_SILENCE_WARN_SECONDS } from "@/lib/teacherSilence";

// Sanad does not run its own silence clock. It reads the same clock the 4 min warning and the 5 min
// violation use (src/lib/teacherSilence.ts), so the notice and the violation can never disagree.
export const SANAD_TOAST_GAP_MS = 120_000; // at most one auto toast per 2 minutes

// One suggestion per silent stretch: suggest when the shared clock reaches the warning level, re-arm when it drops.
export function nextSanadSilenceState(silentSeconds: number, alreadyNotified: boolean): { suggest: boolean; notified: boolean } {
  if (silentSeconds < TEACHER_SILENCE_WARN_SECONDS) return { suggest: false, notified: false };
  return { suggest: !alreadyNotified, notified: true };
}

export function hasSummaryContent(data: { recommendation?: string | null; summary_points?: unknown[] | null } | null | undefined): boolean {
  if (!data) return false;
  const hasText = typeof data.recommendation === "string" && data.recommendation.trim().length > 0;
  const hasPoints = Array.isArray(data.summary_points) && data.summary_points.some((p) => typeof p === "string" && p.trim().length > 0);
  return hasText || hasPoints;
}

export function shouldShowSanadToast(input: { lastToastAt: number; now: number; panelOpen: boolean }): boolean {
  if (input.panelOpen) return false;
  return input.now - input.lastToastAt >= SANAD_TOAST_GAP_MS;
}
