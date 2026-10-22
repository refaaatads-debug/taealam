import { describe, expect, it } from "vitest";
import { resolveActualBookingPrice } from "./adminBookingPrice";

describe("resolveActualBookingPrice", () => {
  it("shows zero for cancelled and incomplete bookings", () => {
    expect(resolveActualBookingPrice({ source: "booking", status: "cancelled", price: 80 })).toBe(0);
    expect(resolveActualBookingPrice({ source: "booking", status: "confirmed", price: 80 })).toBe(0);
  });

  it("uses the saved online gross amount for a completed lesson", () => {
    expect(resolveActualBookingPrice({
      source: "booking",
      status: "completed",
      delivery_mode: "online",
      price: 90,
      online_gross_amount: 75,
    })).toBe(75);
  });

  it("uses the saved in-person student value for a completed lesson", () => {
    expect(resolveActualBookingPrice({
      source: "booking",
      status: "completed",
      delivery_mode: "in_person",
      price: 80,
      in_person_student_value_sar: "100",
    })).toBe(100);
  });

  it("falls back only to the persisted booking price when no actual ledger amount exists", () => {
    expect(resolveActualBookingPrice({
      source: "booking",
      status: "completed",
      delivery_mode: "online",
      price: "42.5",
    })).toBe(42.5);
  });

  it("does not show a request amount as a completed lesson price", () => {
    expect(resolveActualBookingPrice({
      source: "request",
      status: "completed",
      price: 80,
      delivery_mode: "online",
    })).toBe(0);
  });
});
