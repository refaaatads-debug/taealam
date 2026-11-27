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

/**
 * Pick the counted-seconds value to continue from after a refresh, a long absence, or a switch of
 * device. Takes the highest valid value among the browser checkpoint and the server's saved counted
 * seconds. It never uses wall-clock time, so outage or pause time is never added.
 */
export function mergeRestoredElapsed(...candidates: unknown[]) {
  let best: number | null = null;
  for (const value of candidates) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    const whole = Math.floor(value);
    if (best === null || whole > best) best = whole;
  }
  return best;
}

// When the expected peer leaves the Agora channel, only the peer is gone. Our own Agora connection
// is still fine, so the RTC state must not be forced to "disconnected" (that paused the timer and
// kept showing "reconnecting" even after the peer came back without publishing audio).
export function shouldMarkRtcDisconnectedOnPeerLeft(ownAgoraState: string | null | undefined) {
  return ownAgoraState !== "CONNECTED";
}
