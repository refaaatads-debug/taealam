import { describe, expect, it } from "vitest";
import { monthBoundsIso, summarizeMonthViolations } from "../monthViolations";

describe("monthBoundsIso", () => {
  it("returns Riyadh month bounds as UTC instants", () => {
    expect(monthBoundsIso("2026-11")).toEqual({ from: "2026-10-31T21:00:00.000Z", to: "2026-11-30T21:00:00.000Z" });
  });
  it("rolls over December", () => {
    expect(monthBoundsIso("2026-12")?.to).toBe("2026-12-31T21:00:00.000Z");
  });
  it("rejects bad input", () => {
    expect(monthBoundsIso("")).toBeNull();
    expect(monthBoundsIso("2026-13")).toBeNull();
    expect(monthBoundsIso("26-1")).toBeNull();
  });
});

describe("summarizeMonthViolations", () => {
  const rows = [
    { id: "1", violation_type: "phone_number", is_reviewed: true, is_false_positive: false, created_at: "2026-11-02T10:00:00Z" },
    { id: "2", violation_type: "teacher_silence", is_reviewed: false, is_false_positive: false, created_at: "2026-11-05T10:00:00Z" },
    { id: "3", violation_type: "phone_number", is_reviewed: true, is_false_positive: true, created_at: "2026-11-06T10:00:00Z" },
    { id: "4", violation_type: "email", is_reviewed: false, is_false_positive: false, deleted_at: "2026-11-07T00:00:00Z", created_at: "2026-11-07T10:00:00Z" },
  ];
  it("excludes false positives and archived rows from counts", () => {
    const s = summarizeMonthViolations(rows);
    expect(s.total).toBe(2);
    expect(s.confirmed).toBe(1);
    expect(s.pending).toBe(1);
    expect(s.excluded).toBe(2);
  });
  it("groups by type, most severe first, and lists newest first", () => {
    const s = summarizeMonthViolations(rows);
    expect(s.byType.map((t) => t.type)).toEqual(["phone_number", "teacher_silence"]);
    expect(s.items.map((r) => r.id)).toEqual(["2", "1"]);
  });
  it("handles empty input", () => {
    expect(summarizeMonthViolations([])).toMatchObject({ total: 0, confirmed: 0, pending: 0, excluded: 0, byType: [], items: [] });
  });
});
