import { describe, expect, it } from "vitest";
import {
  canJoinOnlineBooking,
  completedTeachingSeconds,
  shouldOfferInPersonCode,
} from "./bookingPresentation";

describe("booking presentation", () => {
  it("never offers an online join for an in-person booking", () => {
    expect(canJoinOnlineBooking({
      delivery_mode: "in_person",
      status: "confirmed",
      session_status: "in_progress",
    })).toBe(false);
  });

  it("hides the attendance-code prompt after attendance is confirmed", () => {
    expect(shouldOfferInPersonCode({
      delivery_mode: "in_person",
      status: "confirmed",
      session_status: "in_progress",
      attendance_confirmed_at: "2026-10-26T12:00:00Z",
    })).toBe(false);
    expect(shouldOfferInPersonCode({
      delivery_mode: "in_person",
      status: "confirmed",
      session_status: "confirmed",
      attendance_confirmed_at: null,
    })).toBe(true);
  });

  it("uses the saved in-person teaching duration instead of the 100-minute package debit", () => {
    expect(completedTeachingSeconds(
      { delivery_mode: "in_person", instruction_duration_minutes: 45, duration_minutes: 60 },
      { deducted_minutes: 100, duration_seconds: 3600 },
    )).toBe(45 * 60);
  });

  it("uses online session usage when calculating online teaching time", () => {
    expect(completedTeachingSeconds(
      { delivery_mode: "online" },
      { deducted_minutes: 42, duration_seconds: 3600 },
    )).toBe(42 * 60);
  });
});
