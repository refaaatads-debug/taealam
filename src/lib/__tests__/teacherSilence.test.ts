import { describe, expect, it } from "vitest";
import {
  advanceSilenceClock, initialSilenceClock, silentSeconds, restoreSilenceClock, restoreSilentMs, silenceStorageKey,
  TEACHER_SILENCE_VIOLATION_SECONDS, TEACHER_SILENCE_WARN_SECONDS,
} from "../teacherSilence";

const run = (steps: Array<{ measurable: boolean; teacherSpeaking: boolean }>, tickMs = 1000) => {
  let clock = initialSilenceClock();
  let now = 0;
  for (const s of steps) { now += tickMs; clock = advanceSilenceClock(clock, { now, ...s }); }
  return clock;
};
const silent = (n: number) => Array.from({ length: n }, () => ({ measurable: true, teacherSpeaking: false }));
const paused = (n: number) => Array.from({ length: n }, () => ({ measurable: false, teacherSpeaking: false }));

describe("teacher silence clock", () => {
  it("counts continuous silence from the first measurable tick", () => {
    expect(silentSeconds(run(silent(301)))).toBe(300);
  });
  it("reaches the 4 minute warning and the 5 minute violation thresholds", () => {
    expect(silentSeconds(run(silent(241)))).toBeGreaterThanOrEqual(TEACHER_SILENCE_WARN_SECONDS);
    expect(silentSeconds(run(silent(301)))).toBeGreaterThanOrEqual(TEACHER_SILENCE_VIOLATION_SECONDS);
    expect(silentSeconds(run(silent(250)))).toBeLessThan(TEACHER_SILENCE_VIOLATION_SECONDS);
  });
  it("a harmless gap pauses the clock and does not reset it", () => {
    const clock = run([...silent(200), ...paused(60), ...silent(101)]);
    expect(silentSeconds(clock)).toBe(300);
  });
  it("the teacher speaking resets the clock", () => {
    const clock = run([...silent(200), { measurable: true, teacherSpeaking: true }, ...silent(50)]);
    expect(silentSeconds(clock)).toBe(50);
  });
  it("speaking resets even during a paused gap", () => {
    const clock = run([...silent(200), { measurable: false, teacherSpeaking: true }, ...silent(10)]);
    expect(silentSeconds(clock)).toBe(10);
  });
  it("a long paused period adds nothing", () => {
    expect(silentSeconds(run(paused(600)))).toBe(0);
  });
  it("a hidden tab ticking once a minute still counts real time", () => {
    let c = { silentMs: 0, lastTickAt: 0 as number | null };
    for (let i = 1; i <= 5; i++) c = advanceSilenceClock(c, { now: i * 60_000, measurable: true, teacherSpeaking: false });
    expect(silentSeconds(c)).toBe(300);
  });
  it("one huge gap (sleep) cannot jump the clock more than the cap", () => {
    const c = advanceSilenceClock({ silentMs: 0, lastTickAt: 0 }, { now: 3_600_000, measurable: true, teacherSpeaking: false });
    expect(c.silentMs).toBe(65_000);
  });
  it("restores silent time after a reload without counting the time the page was away", () => {
    const restored = restoreSilenceClock("200000");
    expect(restored).toEqual({ silentMs: 200000, lastTickAt: null });
    const c = advanceSilenceClock(restored, { now: 999_999, measurable: true, teacherSpeaking: false });
    expect(silentSeconds(c)).toBe(200);
  });
  it("ignores bad or missing saved values and caps big ones", () => {
    expect(restoreSilentMs(null)).toBe(0);
    expect(restoreSilentMs("abc")).toBe(0);
    expect(restoreSilentMs("-5")).toBe(0);
    expect(restoreSilentMs("99999999")).toBe(600000);
    expect(silenceStorageKey("b1")).toBe("teacher_silence_ms_b1");
  });
  it("a muted microphone is just silence: the same clock counts it", () => {
    expect(silentSeconds(run(silent(301)))).toBe(300);
  });
});
