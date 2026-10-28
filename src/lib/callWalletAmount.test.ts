import { describe, expect, it } from "vitest";
import { callWalletAmount } from "../../supabase/functions/_shared/call-wallet-amount";

describe("call wallet compatibility", () => {
  it("removes floating point artifacts before the financial RPC", () => {
    expect(3 * 0.3).not.toBe(0.9);
    expect(callWalletAmount(3, 0.3)).toBe(0.9);
    expect(callWalletAmount(9, 0.3)).toBe(2.7);
  });
  it("rounds estimated minutes up, and the reservation to cents", () => {
    expect(callWalletAmount(2.1, 0.125)).toBe(0.38);
  });
  it("rejects non-finite and non-positive input", () => {
    for (const value of [NaN, Infinity, -1, 0]) {
      expect(() => callWalletAmount(value, 0.3)).toThrow();
      expect(() => callWalletAmount(3, value)).toThrow();
    }
  });
});
