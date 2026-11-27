import { describe, expect, it } from "vitest";
import {
  advanceSilenceClock, initialSilenceClock, silentSeconds,
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
  it("a throttled tick cannot jump the clock more than 5 seconds", () => {
    const c = advanceSilenceClock({ silentMs: 0, lastTickAt: 0 }, { now: 60_000, measurable: true, teacherSpeaking: false });
    expect(c.silentMs).toBe(5000);
  });
});
