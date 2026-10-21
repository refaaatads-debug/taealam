/**
 * Online-booking expiry logic - mirrors the SQL function
 * `auto_expire_stale_bookings`. In-person deadlines are processed separately.
 * 
 * A booking is considered "stale" (eligible for auto-cancellation) when:
 *   1. Status is 'pending' or 'confirmed'
 *   2. scheduled_at + duration_minutes + 30 min grace < now()
 *   3. No session has ever started (sessions.started_at IS NULL)
 * 
 * This module exposes the threshold + decision logic so it can be unit-tested
 * independently of the database, ensuring delays/extensions don't trigger
 * false expirations.
 */

export const GRACE_PERIOD_MINUTES = 30;

export interface BookingLike {
  status: string;
  scheduled_at: Date | string;
  duration_minutes: number;
  delivery_mode?: "online" | "in_person";
  attendance_confirmed?: boolean;
  /** True if a session row exists with started_at !== null */
  session_started?: boolean;
}

/**
 * Returns the timestamp at which a booking becomes eligible for auto-expiry.
 * = scheduled_at + duration_minutes + GRACE_PERIOD_MINUTES
 */
export function getExpiryThreshold(
  scheduledAt: Date | string,
  durationMinutes: number,
): Date {
  const start = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  const totalMs = (durationMinutes + GRACE_PERIOD_MINUTES) * 60 * 1000;
  return new Date(start.getTime() + totalMs);
}

/**
 * Decides whether a booking should be auto-cancelled at the given `now` time.
 */
export function shouldAutoExpire(
  booking: BookingLike,
  now: Date = new Date(),
): boolean {
  // In-person requests have their own attendance-code deadline processor.
  // They must never be treated as online no-shows.
  if (booking.delivery_mode === "in_person" || booking.attendance_confirmed === true) {
    return false;
  }

  // Only pending/confirmed bookings are candidates
  if (booking.status !== "pending" && booking.status !== "confirmed") {
    return false;
  }

  // If a session has actually started, never expire (extension/delay during session is OK)
  if (booking.session_started === true) {
    return false;
  }

  // Must be past the grace threshold
  const threshold = getExpiryThreshold(booking.scheduled_at, booking.duration_minutes);
  return threshold.getTime() < now.getTime();
}
