import { describe, expect, it } from "vitest";
import { buildLiveMeasuredStats, hasEnoughLiveData } from "../liveReportView";

describe("live report view", () => {
  it("is not enough data at 52 seconds with no chat and no speech", () => {
    expect(hasEnoughLiveData({ elapsedSeconds: 52, teacherSpeakingSec: 0, studentSpeakingSec: 0, messageCount: 0 })).toBe(false);
  });
  it("is not enough data after 10 minutes of silence and no chat", () => {
    expect(hasEnoughLiveData({ elapsedSeconds: 600, teacherSpeakingSec: 0, studentSpeakingSec: 0, messageCount: 0 })).toBe(false);
  });
  it("is enough with speech or chat after 5 minutes", () => {
    expect(hasEnoughLiveData({ elapsedSeconds: 400, teacherSpeakingSec: 40, studentSpeakingSec: 0, messageCount: 0 })).toBe(true);
    expect(hasEnoughLiveData({ elapsedSeconds: 400, teacherSpeakingSec: 0, studentSpeakingSec: 0, messageCount: 3 })).toBe(true);
  });
  it("is not enough before 5 minutes even with chat", () => {
    expect(hasEnoughLiveData({ elapsedSeconds: 200, teacherSpeakingSec: 60, studentSpeakingSec: 0, messageCount: 5 })).toBe(false);
  });
  it("measures real minutes and derives silence from them, never from the booked length", () => {
    const s = buildLiveMeasuredStats({ elapsedSeconds: 600, teacherSpeakingSec: 180, studentSpeakingSec: 60, messageCount: 4 });
    expect(s).toEqual({ elapsedMinutes: 10, teacherSpeakingMinutes: 3, studentSpeakingMinutes: 1, silenceMinutes: 6 });
  });
  it("never reports negative silence", () => {
    expect(buildLiveMeasuredStats({ elapsedSeconds: 60, teacherSpeakingSec: 50, studentSpeakingSec: 50, messageCount: 0 }).silenceMinutes).toBe(0);
  });
});
