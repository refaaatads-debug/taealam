import { describe, it, expect } from "vitest";
import { applyViolationFilters, DEFAULT_FILTERS, metaFor, severityOf, sortBySeverityThenDate } from "../violationMeta";

const rows = [
  { id: 1, violation_type: "teacher_late", source: "session", created_at: "2026-11-01T10:00:00Z" },
  { id: 2, violation_type: "contact_sharing", source: "chat", created_at: "2026-11-01T09:00:00Z" },
  { id: 3, violation_type: "address_sharing", source: "voice", created_at: "2026-11-02T09:00:00Z" },
  { id: 4, violation_type: "something_new", source: "chat", created_at: "2026-11-03T09:00:00Z" },
];

describe("violationMeta", () => {
  it("maps types to severity and falls back safely", () => {
    expect(severityOf("teacher_silence")).toBe("low");
    expect(severityOf("contact_sharing")).toBe("high");
    expect(severityOf("coded_message")).toBe("critical");
    expect(severityOf("unknown_type")).toBe("medium");
    expect(severityOf(null)).toBe("medium");
    expect(metaFor("address_sharing").label).toBe("مشاركة عنوان");
  });
  it("filters by severity, type and source", () => {
    expect(applyViolationFilters(rows, DEFAULT_FILTERS)).toHaveLength(4);
    expect(applyViolationFilters(rows, { ...DEFAULT_FILTERS, severity: "high" }).map((r) => r.id)).toEqual([2, 3]);
    expect(applyViolationFilters(rows, { ...DEFAULT_FILTERS, source: "chat" }).map((r) => r.id)).toEqual([2, 4]);
    expect(applyViolationFilters(rows, { severity: "high", type: "address_sharing", source: "voice" }).map((r) => r.id)).toEqual([3]);
  });
  it("sorts highest severity first, then newest", () => {
    expect(sortBySeverityThenDate(rows).map((r) => r.id)).toEqual([3, 2, 4, 1]);
  });
});
