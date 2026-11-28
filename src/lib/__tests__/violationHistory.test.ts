import { describe, it, expect } from "vitest";
import { summarizeUserViolations } from "../violationHistory";

const now = Date.parse("2026-11-28T00:00:00Z");
const d = (days: number) => new Date(now - days * 86400000).toISOString();

describe("summarizeUserViolations", () => {
  it("counts per user, ignores false positives, tracks status", () => {
    const rows = [
      { user_id: "a", violation_type: "contact_sharing", is_reviewed: true, created_at: d(2) },
      { user_id: "a", violation_type: "teacher_late", is_reviewed: false, created_at: d(1) },
      { user_id: "a", violation_type: "address_sharing", is_reviewed: true, is_false_positive: true, created_at: d(1) },
      { user_id: "b", violation_type: "contact_sharing", created_at: d(1) },
    ];
    const s = summarizeUserViolations(rows, "a", now);
    expect(s.total).toBe(2);
    expect(s.confirmed).toBe(1);
    expect(s.pending).toBe(1);
    expect(s.falsePositive).toBe(1);
    expect(s.highestSeverity).toBe("high");
    expect(s.escalate).toBe(false);
    expect(s.firstAt).toBe(d(2));
  });
  it("escalates on 3 high in 30 days or any critical", () => {
    const high = (days: number) => ({ user_id: "a", violation_type: "phone_number", created_at: d(days) });
    expect(summarizeUserViolations([high(1), high(5), high(9)], "a", now).escalate).toBe(true);
    expect(summarizeUserViolations([high(1), high(5), high(45)], "a", now).escalate).toBe(false);
    expect(summarizeUserViolations([{ user_id: "a", violation_type: "coded_message", created_at: d(90) }], "a", now).escalate).toBe(true);
  });
  it("handles a user with no rows", () => {
    const s = summarizeUserViolations([], "x", now);
    expect(s.total).toBe(0);
    expect(s.highestSeverity).toBeNull();
  });
});
