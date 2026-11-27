// Sanad (live assistant) signals: voice-based silence, summary content check, toast rate limit.

export const SANAD_SILENCE_MS = 240_000; // same 4 minutes as the teacher voice-silence warning
export const SANAD_TOAST_GAP_MS = 120_000; // at most one auto toast per 2 minutes

export function isTeacherVoiceSilent(lastTeacherVoiceAt: number, now: number, thresholdMs = SANAD_SILENCE_MS): boolean {
  return now - lastTeacherVoiceAt >= thresholdMs;
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
