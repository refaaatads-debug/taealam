import { describe, expect, it } from "vitest";
import { parseStoredReport } from "../storedSessionReport";

const base = (over: Record<string, unknown>) => JSON.stringify({ summary: "ملخص", performance_score: 90, quality_score: 0, ...over });

describe("stored session report view", () => {
  it("null or broken report is insufficient", () => {
    expect(parseStoredReport(null).status).toBe("insufficient");
    expect(parseStoredReport("not json").status).toBe("insufficient");
    expect(parseStoredReport("[]").status).toBe("insufficient");
  });
  it("data_level none (the 90/100 default case) is insufficient and exposes no score", () => {
    const v = parseStoredReport(base({ data_level: "none", raw_stats: { duration_minutes: 45, silence_minutes: 45 } }));
    expect(v.status).toBe("insufficient");
    expect(JSON.stringify(v)).not.toContain("90");
  });
  it("old reports without data_level are insufficient", () => {
    expect(parseStoredReport(base({ raw_stats: { duration_minutes: 45 } })).status).toBe("insufficient");
  });
  it("ready report shows measured values and never a score", () => {
    const v = parseStoredReport(base({ data_level: "rich", raw_stats: { duration_minutes: 30, teacher_speaking_minutes: 10, student_speaking_minutes: 5, silence_minutes: 15, total_messages: 4, questions_detected: 2, violations_count: 0 } }));
    expect(v.status).toBe("ready");
    expect(v.teacherSpeakingMinutes).toBe(10);
    expect(v.silenceMinutes).toBe(15);
    expect("performanceScore" in v).toBe(false);
  });
  it("hides speaking and silence when no speech was measured", () => {
    const v = parseStoredReport(base({ data_level: "minimal", raw_stats: { duration_minutes: 30, teacher_speaking_minutes: 0, student_speaking_minutes: 0, silence_minutes: 30, total_messages: 2 } }));
    expect(v.status).toBe("ready");
    expect(v.silenceMinutes).toBeUndefined();
    expect(v.teacherSpeakingMinutes).toBeUndefined();
    expect(v.messages).toBe(2);
  });
});
