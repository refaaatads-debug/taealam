import { describe, expect, it } from "vitest";
import { arabicBookingError } from "./arabicBookingError";

describe("arabicBookingError", () => {
  it("translates the in-person overlap shown by the booking RPC", () => {
    expect(arabicBookingError(new Error("This student or teacher already has an in-person lesson at that time")))
      .toContain("توجد حصة حضورية متعارضة");
  });

  it("translates online overlap errors", () => {
    expect(arabicBookingError("This student or teacher already has an online lesson at that time"))
      .toContain("حصة عن بُعد متعارضة");
  });

  it("keeps Arabic server errors and hides unknown English server text", () => {
    expect(arabicBookingError("تعذر تحديث الرصيد")).toBe("تعذر تحديث الرصيد");
    expect(arabicBookingError("unexpected database detail")).toBe("تعذر إكمال الطلب. حاول مرة أخرى.");
  });
});
