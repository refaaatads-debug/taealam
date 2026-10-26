import { describe, expect, it } from "vitest";
import { isValidInPersonDuration, packageMinutesForInPersonLesson } from "./inPersonDuration";

describe("in-person duration and package debit", () => {
  it.each([15, 45, 60, 100, 180])("accepts %i minutes and debits the same amount", (minutes) => {
    expect(isValidInPersonDuration(minutes)).toBe(true);
    expect(packageMinutesForInPersonLesson(minutes)).toBe(minutes);
  });

  it.each([14, 181, 45.5, Number.NaN])("rejects invalid duration %s", (minutes) => {
    expect(isValidInPersonDuration(minutes)).toBe(false);
    expect(() => packageMinutesForInPersonLesson(minutes)).toThrow(RangeError);
  });
});
