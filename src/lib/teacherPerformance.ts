export interface SavedInPersonFinancials {
  teacher_earning?: number | string | null;
  teacher_earning_status?: string | null;
  teacher_compensation?: number | string | null;
  compensation_status?: string | null;
}

export interface SavedOnlineSessionFinancials {
  teacher_earning?: number | string | null;
  net_amount?: number | string | null;
  short_session?: boolean | null;
}

export function resolveSavedTeacherEarning(input: {
  deliveryMode: "online" | "in_person" | null;
  status: string;
  inPerson?: SavedInPersonFinancials | null;
  online?: SavedOnlineSessionFinancials | null;
}): number | null {
  if (input.deliveryMode === "in_person") {
    const hasEarning = input.inPerson?.teacher_earning_status != null;
    const hasCompensation = input.inPerson?.compensation_status != null;
    if (!hasEarning && !hasCompensation) return null;
    return Number(input.inPerson?.teacher_earning ?? 0) +
      Number(input.inPerson?.teacher_compensation ?? 0);
  }

  if (input.status !== "completed") return null;
  if (input.online?.teacher_earning != null) return Number(input.online.teacher_earning);
  if (input.online?.net_amount != null) return Number(input.online.net_amount);
  if (input.online?.short_session) return 0;
  return null;
}

export function resolveRecordedSessionStart(input: {
  deliveryMode: "online" | "in_person" | null;
  sessionStartedAt?: string | null;
  attendanceConfirmedAt?: string | null;
}): string | null {
  return input.sessionStartedAt ??
    (input.deliveryMode === "in_person" ? input.attendanceConfirmedAt ?? null : null);
}

export function resolveReportedTeachingMinutes(input: {
  deliveryMode: "online" | "in_person" | null;
  status: string;
  inPersonTeachingMinutes?: number | null;
  savedInstructionMinutes?: number | null;
  savedBookingMinutes?: number | null;
  deductedMinutes?: number | null;
  durationSeconds?: number | null;
}): number | null {
  if (input.status !== "completed") return null;
  if (input.deliveryMode === "in_person") {
    const minutes = Number(
      input.inPersonTeachingMinutes ??
      input.savedInstructionMinutes ??
      input.savedBookingMinutes,
    );
    return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
  }
  if (input.deductedMinutes != null && input.deductedMinutes > 0) return input.deductedMinutes;
  if (input.durationSeconds != null && input.durationSeconds > 0) return Math.ceil(input.durationSeconds / 60);
  return null;
}
