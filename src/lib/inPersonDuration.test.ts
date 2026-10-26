import { describe, expect, it } from "vitest";
import { isValidInPersonDuration, isValidInPersonPackageDebit, packageMinutesForInPersonLesson } from "./inPersonDuration";

describe("in-person duration and package debit", () => {
  it.each([15, 45, 60, 100, 180])("accepts %i minutes as a teaching duration", (minutes) => {
    expect(isValidInPersonDuration(minutes)).toBe(true);
  });

  it("keeps teaching time separate from package debit", () => {
    expect(packageMinutesForInPersonLesson(60, 100)).toBe(100);
    expect(isValidInPersonPackageDebit(100, 60)).toBe(true);
    expect(isValidInPersonPackageDebit(59, 60)).toBe(false);
    expect(() => packageMinutesForInPersonLesson(60, 59)).toThrow(RangeError);
  });

  it.each([14, 181, 45.5, Number.NaN])("rejects invalid duration %s", (minutes) => {
    expect(isValidInPersonDuration(minutes)).toBe(false);
    expect(() => packageMinutesForInPersonLesson(minutes)).toThrow(RangeError);
  });
});
