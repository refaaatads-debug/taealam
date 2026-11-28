import { describe, it, expect } from "vitest";
import { banStateAfterReversal, nextWarningCount } from "../violationReview";

describe("violation review rules", () => {
  it("never goes below zero", () => {
    expect(nextWarningCount(0, -1)).toBe(0);
    expect(nextWarningCount(2, 1)).toBe(3);
    expect(nextWarningCount(3, -1)).toBe(2);
  });
  it("lifts a ban only when the count drops below 3", () => {
    expect(banStateAfterReversal(2, true)).toEqual({ is_banned: false, banned_until: null });
    expect(banStateAfterReversal(3, true)).toBeNull();
    expect(banStateAfterReversal(1, false)).toBeNull();
  });
});
