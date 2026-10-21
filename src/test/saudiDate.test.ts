import { describe, expect, it } from "vitest";
import { getSaudiMonthKey } from "@/lib/saudiDate";

describe("getSaudiMonthKey", () => {
  it("uses the Asia/Riyadh month when UTC and Saudi dates differ", () => {
    expect(getSaudiMonthKey(new Date("2026-10-31T20:30:00.000Z"))).toBe("2026-10");
    expect(getSaudiMonthKey(new Date("2026-10-31T21:30:00.000Z"))).toBe("2026-11");
  });
});
