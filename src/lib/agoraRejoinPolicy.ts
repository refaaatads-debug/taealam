export type AgoraConnectionState = "CONNECTING" | "CONNECTED" | "RECONNECTING" | "DISCONNECTED" | string;

export const AGORA_REJOIN_MAX_ATTEMPTS = 3;

export function shouldScheduleAgoraRejoin(
  state: AgoraConnectionState,
  attempts: number,
): boolean {
  return (state === "DISCONNECTED" || state === "RECONNECTING") && attempts < AGORA_REJOIN_MAX_ATTEMPTS;
}

export function agoraRejoinDelayMs(attempt: number): number {
  const boundedAttempt = Math.max(1, Math.min(AGORA_REJOIN_MAX_ATTEMPTS, attempt));
  return 5_000 * 2 ** (boundedAttempt - 1);
}
