import { describe, expect, it } from "vitest";
import {
  AGORA_REJOIN_MAX_ATTEMPTS,
  agoraRejoinDelayMs,
  shouldScheduleAgoraRejoin,
} from "../agoraRejoinPolicy";

describe("agoraRejoinPolicy", () => {
  it("schedules bounded rejoins for reconnecting and disconnected Agora states", () => {
    expect(shouldScheduleAgoraRejoin("RECONNECTING", 0)).toBe(true);
    expect(shouldScheduleAgoraRejoin("DISCONNECTED", 0)).toBe(true);
    expect(shouldScheduleAgoraRejoin("DISCONNECTED", AGORA_REJOIN_MAX_ATTEMPTS - 1)).toBe(true);
    expect(shouldScheduleAgoraRejoin("DISCONNECTED", AGORA_REJOIN_MAX_ATTEMPTS)).toBe(false);
    expect(shouldScheduleAgoraRejoin("CONNECTED", 0)).toBe(false);
  });

  it("backs off rejoin attempts", () => {
    expect(agoraRejoinDelayMs(1)).toBe(5_000);
    expect(agoraRejoinDelayMs(2)).toBe(10_000);
    expect(agoraRejoinDelayMs(3)).toBe(20_000);
  });
});
