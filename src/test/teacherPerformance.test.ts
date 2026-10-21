import { describe, expect, it } from "vitest";
import {
  resolveRecordedSessionStart,
  resolveReportedTeachingMinutes,
  resolveSavedTeacherEarning,
} from "@/lib/teacherPerformance";

describe("saved teacher performance values", () => {
  it("keeps a saved zero earning instead of replacing it with another amount", () => {
    expect(resolveSavedTeacherEarning({
      deliveryMode: "online",
      status: "completed",
      online: { teacher_earning: 0, net_amount: 60 },
    })).toBe(0);
  });

  it("reads in-person earning and compensation from their saved ledger rows", () => {
    expect(resolveSavedTeacherEarning({
      deliveryMode: "in_person",
      status: "completed",
      inPerson: {
        teacher_earning: 60,
        teacher_earning_status: "available",
        teacher_compensation: 0,
        compensation_status: null,
      },
    })).toBe(60);
  });

  it("does not infer a historical in-person earning when no ledger row exists", () => {
    expect(resolveSavedTeacherEarning({
      deliveryMode: "in_person",
      status: "completed",
      inPerson: { teacher_earning: 0, teacher_earning_status: null },
    })).toBeNull();
  });

  it("uses the saved attendance confirmation as the in-person start record without inventing an end time", () => {
    const confirmedAt = "2026-10-21T07:01:07.694Z";
    expect(resolveRecordedSessionStart({
      deliveryMode: "in_person",
      attendanceConfirmedAt: confirmedAt,
    })).toBe(confirmedAt);
    expect(resolveRecordedSessionStart({
      deliveryMode: "online",
      attendanceConfirmedAt: confirmedAt,
    })).toBeNull();
  });

  it("reports saved instructional minutes separately from package-credit minutes", () => {
    expect(resolveReportedTeachingMinutes({
      deliveryMode: "in_person",
      status: "completed",
      inPersonTeachingMinutes: null,
      savedInstructionMinutes: 45,
      savedBookingMinutes: 100,
    })).toBe(45);
  });

  it("uses approved deducted minutes for online lessons and omits unverified durations", () => {
    expect(resolveReportedTeachingMinutes({
      deliveryMode: "online",
      status: "completed",
      deductedMinutes: 52,
      durationSeconds: 3_600,
    })).toBe(52);
    expect(resolveReportedTeachingMinutes({
      deliveryMode: "in_person",
      status: "unverified",
      savedInstructionMinutes: 60,
    })).toBeNull();
    expect(resolveReportedTeachingMinutes({
      deliveryMode: "in_person",
      status: "unverified",
      savedInstructionMinutes: 60,
    })).toBeNull();
  });
});
