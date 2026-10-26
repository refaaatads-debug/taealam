const RIYADH_TIME_ZONE = "Asia/Riyadh";
const SAUDI_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

function datePartsInRiyadh(date: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: RIYADH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  if (!year || !month || !day) throw new Error("Could not format the Saudi calendar date");
  return { year, month, day };
}

export function getSaudiMonthKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: RIYADH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Could not format the Saudi calendar month");
  return `${year}-${month}`;
}

/** Returns the Saudi calendar date as a local-midnight Date for calendar widgets. */
export function getSaudiCalendarDate(date: Date = new Date()): Date {
  const { year, month, day } = datePartsInRiyadh(date);
  return new Date(year, month - 1, day);
}

/** Key for an instant, grouped by the date users see in Saudi Arabia. */
export function getSaudiDayKey(date: Date): string {
  const { year, month, day } = datePartsInRiyadh(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Key for a calendar-cell Date whose year/month/day are calendar labels, not an instant. */
export function getCalendarDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Convert a Saudi calendar date at 00:00 to its UTC instant (Riyadh is UTC+03:00). */
export function getSaudiDayStartUtc(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - SAUDI_UTC_OFFSET_MS);
}

export function isSaudiDayWithinCalendarRange(
  instant: Date,
  rangeStart: Date,
  rangeEndExclusive: Date,
): boolean {
  const dayKey = getSaudiDayKey(instant);
  return dayKey >= getCalendarDayKey(rangeStart)
    && dayKey < getCalendarDayKey(rangeEndExclusive);
}
