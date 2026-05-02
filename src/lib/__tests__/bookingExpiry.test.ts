import { describe, it, expect } from "vitest";
import {
  GRACE_PERIOD_MINUTES,
  getExpiryThreshold,
  shouldAutoExpire,
  type BookingLike,
} from "../bookingExpiry";

const minutes = (n: number) => n * 60 * 1000;

describe("getExpiryThreshold", () => {
  it("adds duration + 30min grace to scheduled_at", () => {
    const scheduled = new Date("2026-05-02T10:00:00Z");
    const threshold = getExpiryThreshold(scheduled, 45);
    // 10:00 + 45min + 30min grace = 11:15
    expect(threshold.toISOString()).toBe("2026-05-02T11:15:00.000Z");
  });

  it("accepts ISO strings", () => {
    const threshold = getExpiryThreshold("2026-05-02T10:00:00Z", 60);
    expect(threshold.toISOString()).toBe("2026-05-02T11:30:00.000Z");
  });

  it("uses GRACE_PERIOD_MINUTES = 30", () => {
    expect(GRACE_PERIOD_MINUTES).toBe(30);
  });
});

describe("shouldAutoExpire", () => {
  const baseScheduled = new Date("2026-05-02T10:00:00Z");
  const baseBooking: BookingLike = {
    status: "confirmed",
    scheduled_at: baseScheduled,
    duration_minutes: 45,
  };

  describe("status filtering", () => {
    it("expires confirmed bookings past threshold", () => {
      const now = new Date(baseScheduled.getTime() + minutes(45 + 31));
      expect(shouldAutoExpire({ ...baseBooking, status: "confirmed" }, now)).toBe(true);
    });

    it("expires pending bookings past threshold", () => {
      const now = new Date(baseScheduled.getTime() + minutes(45 + 31));
      expect(shouldAutoExpire({ ...baseBooking, status: "pending" }, now)).toBe(true);
    });

    it("never expires already-completed bookings", () => {
      const now = new Date(baseScheduled.getTime() + minutes(1000));
      expect(shouldAutoExpire({ ...baseBooking, status: "completed" }, now)).toBe(false);
    });

    it("never expires already-cancelled bookings", () => {
      const now = new Date(baseScheduled.getTime() + minutes(1000));
      expect(shouldAutoExpire({ ...baseBooking, status: "cancelled" }, now)).toBe(false);
    });
  });

  describe("grace period boundary", () => {
    it("does NOT expire exactly at scheduled_at + duration (still inside session window)", () => {
      const now = new Date(baseScheduled.getTime() + minutes(45));
      expect(shouldAutoExpire(baseBooking, now)).toBe(false);
    });

    it("does NOT expire 1 minute before grace ends", () => {
      // 45 + 29 = 74 min; threshold is at 75 min
      const now = new Date(baseScheduled.getTime() + minutes(45 + 29));
      expect(shouldAutoExpire(baseBooking, now)).toBe(false);
    });

    it("does NOT expire at exactly the threshold (strict <)", () => {
      const now = new Date(baseScheduled.getTime() + minutes(45 + 30));
      expect(shouldAutoExpire(baseBooking, now)).toBe(false);
    });

    it("expires 1 minute after grace ends", () => {
      const now = new Date(baseScheduled.getTime() + minutes(45 + 31));
      expect(shouldAutoExpire(baseBooking, now)).toBe(true);
    });
  });

  describe("session already started (delay / extension scenarios)", () => {
    it("does NOT expire if session started, even past threshold (lesson running long)", () => {
      const now = new Date(baseScheduled.getTime() + minutes(1000));
      expect(
        shouldAutoExpire({ ...baseBooking, session_started: true }, now),
      ).toBe(false);
    });

    it("does NOT expire if session started and currently extending past nominal end", () => {
      // Session ran 15 min over scheduled duration
      const now = new Date(baseScheduled.getTime() + minutes(45 + 15));
      expect(
        shouldAutoExpire({ ...baseBooking, session_started: true }, now),
      ).toBe(false);
    });

    it("expires only when session NEVER started (no-show)", () => {
      const now = new Date(baseScheduled.getTime() + minutes(45 + 31));
      expect(
        shouldAutoExpire({ ...baseBooking, session_started: false }, now),
      ).toBe(true);
    });
  });

  describe("late start scenarios (student/teacher delayed)", () => {
    it("a 20-minute late start with no session started yet — still inside grace window", () => {
      // 20 min after scheduled, nothing started; 45+30=75min grace, so we are at 20
      const now = new Date(baseScheduled.getTime() + minutes(20));
      expect(shouldAutoExpire(baseBooking, now)).toBe(false);
    });

    it("session that started 25 min late is protected from auto-expire forever", () => {
      // Even 5 hours later, since session_started=true, it should not be cancelled
      const now = new Date(baseScheduled.getTime() + minutes(5 * 60));
      expect(
        shouldAutoExpire(
          { ...baseBooking, duration_minutes: 30, session_started: true },
          now,
        ),
      ).toBe(false);
    });
  });

  describe("variable durations", () => {
    it("respects 30-min sessions: expires at 60min + 1", () => {
      const b: BookingLike = { ...baseBooking, duration_minutes: 30 };
      const inside = new Date(baseScheduled.getTime() + minutes(59));
      const outside = new Date(baseScheduled.getTime() + minutes(61));
      expect(shouldAutoExpire(b, inside)).toBe(false);
      expect(shouldAutoExpire(b, outside)).toBe(true);
    });

    it("respects 90-min sessions: expires at 120min + 1", () => {
      const b: BookingLike = { ...baseBooking, duration_minutes: 90 };
      const inside = new Date(baseScheduled.getTime() + minutes(119));
      const outside = new Date(baseScheduled.getTime() + minutes(121));
      expect(shouldAutoExpire(b, inside)).toBe(false);
      expect(shouldAutoExpire(b, outside)).toBe(true);
    });
  });

  describe("future bookings", () => {
    it("never expires bookings scheduled in the future", () => {
      const future = new Date(Date.now() + minutes(60));
      expect(
        shouldAutoExpire({ ...baseBooking, scheduled_at: future }),
      ).toBe(false);
    });
  });
});
