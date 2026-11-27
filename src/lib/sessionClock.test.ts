import { describe, expect, it } from "vitest";
import {
  advanceSessionClock,
  canAccumulateSessionTime,
  isExpectedSessionPeer,
  isAuthoritativeTimerSync,
  isValidTimerRequest,
  resolveRemoteEndElapsed,
  restoreSessionClock,
  mergeRestoredElapsed,
  shouldMarkRtcDisconnectedOnPeerLeft,
} from "./sessionClock";

const ready = {
  meetingStarted: true,
  expectedPeerReady: true,
  isOnline: true,
  rtcConnected: true,
  signalingReady: true,
};

describe("session clock readiness and recovery", () => {
  it("does not count a local Agora connection without the expected peer", () => {
    expect(canAccumulateSessionTime({ ...ready, expectedPeerReady: false })).toBe(false);
  });

  it("starts only after a late second participant is ready", () => {
    const oneParticipant = { ...ready, expectedPeerReady: false };
    expect(canAccumulateSessionTime(oneParticipant)).toBe(false);
    expect(canAccumulateSessionTime({ ...oneParticipant, expectedPeerReady: true })).toBe(true);
  });

  it("does not count mute or silence as a timer condition", () => {
    expect(canAccumulateSessionTime(ready)).toBe(true);
  });

  it("pauses on disconnect and resumes from accumulated seconds without charging downtime", () => {
    const paused = advanceSessionClock(42, 1000, 20_000, false);
    expect(paused).toEqual({ elapsed: 42, lastTickAt: 0 });
    const resumed = advanceSessionClock(paused.elapsed, paused.lastTickAt, 50_000, true);
    expect(resumed).toEqual({ elapsed: 42, lastTickAt: 50_000 });
    expect(advanceSessionClock(resumed.elapsed, resumed.lastTickAt, 51_000, true).elapsed).toBe(43);
  });

  it("restores the checkpoint without adding time while the tab was closed", () => {
    expect(restoreSessionClock(75, 10_000, 20_000)).toBe(75);
    expect(restoreSessionClock(75, 10_000, 400_001)).toBeNull();
  });

  it("accepts only the booking counterpart as the remote peer", () => {
    expect(isExpectedSessionPeer("student-1", "student-1")).toBe(true);
    expect(isExpectedSessionPeer("other-user", "student-1")).toBe(false);
    expect(isExpectedSessionPeer("student-1", "")).toBe(false);
  });

  it("accepts timer sync only from the booking teacher and requests only from the student", () => {
    expect(isAuthoritativeTimerSync("teacher-1", "teacher-1", false)).toBe(true);
    expect(isAuthoritativeTimerSync("other-user", "teacher-1", false)).toBe(false);
    expect(isAuthoritativeTimerSync("teacher-1", "teacher-1", true)).toBe(false);
    expect(isValidTimerRequest("student-1", "student-1", true)).toBe(true);
    expect(isValidTimerRequest("other-user", "student-1", true)).toBe(false);
  });

  it("uses the teacher's elapsed value as the shared end state", () => {
    expect(resolveRemoteEndElapsed("student-1", "student-1", true, 50, 54)).toBe(54);
    expect(resolveRemoteEndElapsed("teacher-1", "teacher-1", false, 50, 54)).toBe(50);
    expect(resolveRemoteEndElapsed("stranger", "teacher-1", false, 50, 54)).toBeNull();
  });
});

describe("mergeRestoredElapsed", () => {
  it("takes the highest valid counted value", () => {
    expect(mergeRestoredElapsed(120, 300)).toBe(300);
    expect(mergeRestoredElapsed(300, 120)).toBe(300);
  });
  it("uses the server value when the browser has none (other device)", () => {
    expect(mergeRestoredElapsed(null, 845.9)).toBe(845);
  });
  it("uses the browser value when the server column is missing", () => {
    expect(mergeRestoredElapsed(77, null)).toBe(77);
  });
  it("returns null for zero, negative, NaN or missing values so the clock is never reset by bad data", () => {
    expect(mergeRestoredElapsed(0, null)).toBeNull();
    expect(mergeRestoredElapsed(-5, Number.NaN, undefined, "9")).toBeNull();
  });
});

describe("peer left handling", () => {
  it("keeps the RTC state when only the peer left and our Agora link is connected", () => {
    expect(shouldMarkRtcDisconnectedOnPeerLeft("CONNECTED")).toBe(false);
  });
  it("still marks disconnected when our own Agora link is not connected", () => {
    expect(shouldMarkRtcDisconnectedOnPeerLeft("RECONNECTING")).toBe(true);
    expect(shouldMarkRtcDisconnectedOnPeerLeft("DISCONNECTED")).toBe(true);
    expect(shouldMarkRtcDisconnectedOnPeerLeft(null)).toBe(true);
  });
  it("a peer that never published audio can still start the clock once counted as present", () => {
    expect(canAccumulateSessionTime({ ...ready, expectedPeerReady: true })).toBe(true);
    expect(canAccumulateSessionTime({ ...ready, expectedPeerReady: false })).toBe(false);
  });
});
