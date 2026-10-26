type BookingPresentationInput = {
  delivery_mode?: string | null;
  status?: string | null;
  session_status?: string | null;
  attendance_confirmed_at?: string | null;
};

type CompletedBookingDurationInput = BookingPresentationInput & {
  instruction_duration_minutes?: number | null;
  duration_minutes?: number | null;
};

type SessionDurationInput = {
  deducted_minutes?: number | null;
  duration_seconds?: number | null;
  duration_minutes?: number | null;
  started_at?: string | null;
  ended_at?: string | null;
};

export function shouldOfferInPersonCode(booking: BookingPresentationInput): boolean {
  return booking.delivery_mode === "in_person"
    && booking.status === "confirmed"
    && booking.session_status !== "in_progress"
    && !booking.attendance_confirmed_at;
}

export function canJoinOnlineBooking(booking: BookingPresentationInput): boolean {
  if (booking.delivery_mode === "in_person") return false;
  if (booking.status === "completed" || booking.status === "cancelled") return false;
  return booking.session_status === "in_progress"
    || (booking.status === "confirmed"
      && booking.session_status !== "waiting_acceptance"
      && booking.session_status !== "completed"
      && booking.session_status !== "cancelled");
}

export function completedTeachingSeconds(
  booking: CompletedBookingDurationInput,
  session?: SessionDurationInput | null,
): number {
  if (booking.delivery_mode === "in_person") {
    const minutes = Number(
      booking.instruction_duration_minutes
      ?? booking.duration_minutes
      ?? session?.duration_minutes
      ?? 0,
    );
    return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : 0;
  }

  const deductedMinutes = Number(session?.deducted_minutes ?? 0);
  if (Number.isFinite(deductedMinutes) && deductedMinutes > 0) return deductedMinutes * 60;

  const durationSeconds = Number(session?.duration_seconds ?? 0);
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) return durationSeconds;

  const durationMinutes = Number(session?.duration_minutes ?? 0);
  if (Number.isFinite(durationMinutes) && durationMinutes > 0) return durationMinutes * 60;

  if (session?.started_at && session.ended_at) {
    return Math.max(
      0,
      Math.floor((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000),
    );
  }
  return 0;
}
