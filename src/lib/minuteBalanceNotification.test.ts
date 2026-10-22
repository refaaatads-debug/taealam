import { describe, expect, it } from "vitest";
import { getMinuteBalanceNotification } from "./minuteBalanceNotification";

describe("minute balance notifications", () => {
  it("sends a depletion warning, not a package-expiry notification, at zero minutes", () => {
    expect(getMinuteBalanceNotification(0)).toEqual({
      title: "نفدت دقائق الباقة",
      body: "استهلكت دقائق الباقة المتاحة. أضف رصيد دقائق للمتابعة.",
      type: "subscription_warning",
    });
  });

  it("warns at low balances and sends nothing above the threshold", () => {
    expect(getMinuteBalanceNotification(25)?.type).toBe("subscription_warning");
    expect(getMinuteBalanceNotification(31)).toBeNull();
  });
});
