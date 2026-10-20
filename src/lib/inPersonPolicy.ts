export const IN_PERSON_POLICY = {
  minimumLeadMinutes: 120,
  teacherAcceptanceCutoffMinutes: 60,
  attendanceGraceMinutes: 15,
  teachingMinutes: 60,
  packageCreditMinutes: 100,
  teacherLessonEarningSar: 60,
  lateCancellationCompensationSar: 30,
  teacherTravelBufferMinutes: 30,
} as const;

export type InPersonSettlementReason =
  | "student_cancelled_early"
  | "student_cancelled_late"
  | "teacher_cancelled"
  | "attendance_expired"
  | "code_confirmed";

export interface InPersonSettlement {
  reason: InPersonSettlementReason;
  refundMinutes: number;
  consumeMinutes: number;
  teacherEarningSar: number;
  teacherCompensationSar: number;
}

const MINUTE_MS = 60_000;

export function canCreateInPersonRequest(
  scheduledAt: Date,
  now = new Date(),
): boolean {
  return scheduledAt.getTime() - now.getTime() >= IN_PERSON_POLICY.minimumLeadMinutes * MINUTE_MS;
}

export function teacherAcceptanceDeadline(scheduledAt: Date): Date {
  return new Date(
    scheduledAt.getTime() - IN_PERSON_POLICY.teacherAcceptanceCutoffMinutes * MINUTE_MS,
  );
}

export function canAcceptInPersonRequest(
  scheduledAt: Date,
  now = new Date(),
): boolean {
  return now.getTime() < teacherAcceptanceDeadline(scheduledAt).getTime();
}

export function attendanceDeadline(scheduledAt: Date): Date {
  return new Date(scheduledAt.getTime() + IN_PERSON_POLICY.attendanceGraceMinutes * MINUTE_MS);
}

export function getStudentCancellationSettlement(
  scheduledAt: Date,
  cancelledAt: Date,
  codeConfirmed: boolean,
): InPersonSettlement {
  if (codeConfirmed) {
    return {
      reason: "code_confirmed",
      refundMinutes: 0,
      consumeMinutes: 0,
      teacherEarningSar: IN_PERSON_POLICY.teacherLessonEarningSar,
      teacherCompensationSar: 0,
    };
  }

  if (cancelledAt.getTime() >= attendanceDeadline(scheduledAt).getTime()) {
    return {
      reason: "attendance_expired",
      refundMinutes: IN_PERSON_POLICY.packageCreditMinutes,
      consumeMinutes: 0,
      teacherEarningSar: 0,
      teacherCompensationSar: 0,
    };
  }

  const minutesBeforeStart = (scheduledAt.getTime() - cancelledAt.getTime()) / MINUTE_MS;
  if (minutesBeforeStart >= 60) {
    return {
      reason: "student_cancelled_early",
      refundMinutes: IN_PERSON_POLICY.packageCreditMinutes,
      consumeMinutes: 0,
      teacherEarningSar: 0,
      teacherCompensationSar: 0,
    };
  }

  return {
    reason: "student_cancelled_late",
    refundMinutes: 50,
    consumeMinutes: 50,
    teacherEarningSar: 0,
    teacherCompensationSar: IN_PERSON_POLICY.lateCancellationCompensationSar,
  };
}

export function getTeacherCancellationSettlement(): InPersonSettlement {
  return {
    reason: "teacher_cancelled",
    refundMinutes: IN_PERSON_POLICY.packageCreditMinutes,
    consumeMinutes: 0,
    teacherEarningSar: 0,
    teacherCompensationSar: 0,
  };
}

export function isTeacherScheduleConflict(
  first: { start: Date; durationMinutes: number; mode: "online" | "in_person" },
  second: { start: Date; durationMinutes: number; mode: "online" | "in_person" },
): boolean {
  const firstEnd = first.start.getTime() + first.durationMinutes * MINUTE_MS;
  const secondEnd = second.start.getTime() + second.durationMinutes * MINUTE_MS;
  const needsTravelGap = first.mode === "in_person" || second.mode === "in_person";
  const gapMs = needsTravelGap ? IN_PERSON_POLICY.teacherTravelBufferMinutes * MINUTE_MS : 0;
  return first.start.getTime() < secondEnd + gapMs && firstEnd + gapMs > second.start.getTime();
}
