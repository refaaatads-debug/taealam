import { describe, expect, it } from "vitest";
import {
  getCalendarDayKey,
  getSaudiCalendarDate,
  getSaudiDayKey,
  getSaudiDayStartUtc,
  isSaudiDayWithinCalendarRange,
} from "./saudiDate";

describe("Saudi calendar dates", () => {
  it("groups instants by the Riyadh date even when UTC is still the previous day", () => {
    expect(getSaudiDayKey(new Date("2026-10-25T21:30:00.000Z"))).toBe("2026-10-26");
  });

  it("converts a selected Saudi calendar day to the correct UTC query boundary", () => {
    expect(getSaudiDayStartUtc(new Date(2026, 9, 26)).toISOString()).toBe("2026-10-25T21:00:00.000Z");
  });

  it("keeps calendar-cell labels separate from timestamp time zones", () => {
    expect(getCalendarDayKey(new Date(2026, 9, 26))).toBe("2026-10-26");
  });

  it("returns the current date in Riyadh, not the browser's local date", () => {
    expect(getSaudiCalendarDate(new Date("2026-10-25T21:30:00.000Z")).getDate()).toBe(26);
  });

  it("filters against the browsed calendar week rather than the computer's current week", () => {
    const start = new Date(2026, 9, 25);
    const end = new Date(2026, 10, 1);
    expect(isSaudiDayWithinCalendarRange(new Date("2026-10-26T10:00:00.000Z"), start, end)).toBe(true);
    expect(isSaudiDayWithinCalendarRange(new Date("2026-11-02T10:00:00.000Z"), start, end)).toBe(false);
  });
});
