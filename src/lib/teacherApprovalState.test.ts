import { describe, expect, it } from "vitest";
import { getTeacherApprovalState } from "./teacherApprovalState";

describe("teacher approval state display", () => {
  it("shows an approved account with a stale pending label as audit info, not a conflict", () => {
    expect(getTeacherApprovalState("pending", true)).toEqual({
      stalePendingLabel: true,
      conflict: false,
    });
  });

  it("keeps real final-state contradictions flagged for manual review", () => {
    expect(getTeacherApprovalState("approved", false).conflict).toBe(true);
    expect(getTeacherApprovalState("rejected", true).conflict).toBe(true);
  });
});
