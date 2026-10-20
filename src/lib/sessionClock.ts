export type SessionClockReadiness = {
  meetingStarted: boolean;
  expectedPeerReady: boolean;
  isOnline: boolean;
  rtcConnected: boolean;
  signalingReady: boolean;
};

export function isExpectedSessionPeer(remoteId: string | number | null | undefined, expectedId: string | null | undefined) {
  return Boolean(expectedId && remoteId != null && String(remoteId) === expectedId);
}

export function isAuthoritativeTimerSync(senderId: string | undefined, teacherId: string | undefined, isTeacher: boolean) {
  return !isTeacher && isExpectedSessionPeer(senderId, teacherId);
}

export function isValidTimerRequest(senderId: string | undefined, studentId: string | undefined, isTeacher: boolean) {
  return isTeacher && isExpectedSessionPeer(senderId, studentId);
}

export function resolveRemoteEndElapsed(
  senderId: string | undefined,
  expectedPeerId: string | undefined,
  isTeacher: boolean,
  remoteElapsed: unknown,
  localElapsed: number,
) {
  if (!isExpectedSessionPeer(senderId, expectedPeerId)) return null;
  if (isTeacher || typeof remoteElapsed !== "number" || !Number.isFinite(remoteElapsed)) {
    return Math.max(0, Math.floor(localElapsed));
  }
  return Math.max(0, Math.floor(remoteElapsed));
}

export function canAccumulateSessionTime(state: SessionClockReadiness) {
  return state.meetingStarted
    && state.expectedPeerReady
    && state.isOnline
    && state.rtcConnected
    && state.signalingReady;
}

export function advanceSessionClock(elapsed: number, lastTickAt: number, now: number, canCount: boolean) {
  if (!canCount) return { elapsed, lastTickAt: 0 };
  if (!lastTickAt) return { elapsed, lastTickAt: now };
  const deltaSeconds = Math.max(0, Math.round((now - lastTickAt) / 1000));
  return {
    elapsed: elapsed + Math.min(deltaSeconds || 1, 5),
    lastTickAt: now,
  };
}

export function restoreSessionClock(checkpoint: unknown, checkpointAt: unknown, now: number, maxAgeMs = 300_000) {
  const elapsed = typeof checkpoint === "number" ? checkpoint : Number.NaN;
  const savedAt = typeof checkpointAt === "number" ? checkpointAt : Number.NaN;
  if (!Number.isFinite(elapsed) || elapsed <= 0 || !Number.isFinite(savedAt)) return null;
  if (now - savedAt > maxAgeMs) return null;
  // Resume only accumulated time. Time while the tab was closed may include a peer/network outage.
  return Math.floor(elapsed);
}
