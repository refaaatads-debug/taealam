import { describe, expect, it } from "vitest";
import {
  attendanceDeadline,
  canAcceptInPersonRequest,
  canCreateInPersonRequest,
  getStudentCancellationSettlement,
  getTeacherCancellationSettlement,
  isTeacherScheduleConflict,
  teacherAcceptanceDeadline,
} from "./inPersonPolicy";

const at = (minutesFromStart: number) => new Date(Date.UTC(2026, 9, 20, 12, minutesFromStart));
const start = at(0);

describe("in-person policy", () => {
  it("requires the approved two-hour minimum lead time", () => {
    expect(canCreateInPersonRequest(start, at(-120))).toBe(true);
    expect(canCreateInPersonRequest(start, at(-119))).toBe(false);
  });

  it("closes teacher acceptance at the approved one-hour cutoff", () => {
    expect(teacherAcceptanceDeadline(start).getTime()).toBe(at(-60).getTime());
    expect(canAcceptInPersonRequest(start, at(-61))).toBe(true);
    expect(canAcceptInPersonRequest(start, at(-60))).toBe(false);
  });

  it("expires an unconfirmed attendance code fifteen minutes after the start", () => {
    expect(attendanceDeadline(start).getTime()).toBe(at(15).getTime());
    expect(getStudentCancellationSettlement(start, at(14), false).reason).toBe("student_cancelled_late");
    expect(getStudentCancellationSettlement(start, at(15), false).reason).toBe("attendance_expired");
  });

  it("refunds fully at exactly sixty minutes before start", () => {
    expect(getStudentCancellationSettlement(start, at(-60), false)).toMatchObject({
      refundMinutes: 100,
      consumeMinutes: 0,
      teacherCompensationSar: 0,
    });
  });

  it("applies the fixed late-cancellation settlement without an attendance condition", () => {
    expect(getStudentCancellationSettlement(start, at(-59), false)).toMatchObject({
      refundMinutes: 50,
      consumeMinutes: 50,
      teacherCompensationSar: 30,
    });
  });

  it("fully refunds teacher cancellations without earnings", () => {
    expect(getTeacherCancellationSettlement()).toMatchObject({
      refundMinutes: 100,
      consumeMinutes: 0,
      teacherEarningSar: 0,
    });
  });

  it("applies one thirty-minute travel gap when either lesson is in person", () => {
    expect(isTeacherScheduleConflict(
      { start, durationMinutes: 60, mode: "in_person" },
      { start: at(89), durationMinutes: 60, mode: "online" },
    )).toBe(true);
    expect(isTeacherScheduleConflict(
      { start, durationMinutes: 60, mode: "in_person" },
      { start: at(90), durationMinutes: 60, mode: "online" },
    )).toBe(false);
  });
});
