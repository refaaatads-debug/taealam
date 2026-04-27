// Local-only "hide from view" for bookings — does NOT delete from database
// Each user maintains their own hidden list keyed by their auth user id.
const KEY_PREFIX = "hidden_bookings:";
const ALL_KEY_PREFIX = "hidden_all:";

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeSet(key: string, set: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...set]));
}

export function getHiddenBookings(userId: string): Set<string> {
  if (!userId) return new Set();
  return readSet(KEY_PREFIX + userId);
}

export function hideBooking(userId: string, bookingId: string) {
  if (!userId || !bookingId) return;
  const set = getHiddenBookings(userId);
  set.add(bookingId);
  writeSet(KEY_PREFIX + userId, set);
}

export function unhideBooking(userId: string, bookingId: string) {
  if (!userId || !bookingId) return;
  const set = getHiddenBookings(userId);
  set.delete(bookingId);
  writeSet(KEY_PREFIX + userId, set);
}

export function isBookingHidden(userId: string, bookingId: string): boolean {
  return getHiddenBookings(userId).has(bookingId);
}

// Hide all bookings (full table clear from view)
export function hideAllBookings(userId: string, bookingIds: string[]) {
  if (!userId) return;
  const set = getHiddenBookings(userId);
  bookingIds.forEach(id => set.add(id));
  writeSet(KEY_PREFIX + userId, set);
  localStorage.setItem(ALL_KEY_PREFIX + userId, String(Date.now()));
}

export function clearHiddenBookings(userId: string) {
  if (!userId) return;
  localStorage.removeItem(KEY_PREFIX + userId);
  localStorage.removeItem(ALL_KEY_PREFIX + userId);
}
