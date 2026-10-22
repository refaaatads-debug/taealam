import { describe, expect, it } from "vitest";
import { getMinutePackageStatus } from "./minutePackageStatus";

describe("minute package status", () => {
  it("keeps positive minutes available despite a stale legacy end date", () => {
    expect(getMinutePackageStatus({
      hasSubscription: true,
      remainingMinutes: 75,
      endsAt: "2020-01-01T00:00:00Z",
    })).toBe("available");
  });

  it("marks a package depleted only when its minute balance is exhausted", () => {
    expect(getMinutePackageStatus({ hasSubscription: true, remainingMinutes: 0 })).toBe("depleted");
    expect(getMinutePackageStatus({ hasSubscription: false, remainingMinutes: 0 })).toBe("none");
  });
});
