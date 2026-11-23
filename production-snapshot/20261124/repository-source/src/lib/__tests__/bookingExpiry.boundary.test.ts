import { describe, it, expect } from "vitest";
import {
  getExpiryThreshold,
  shouldAutoExpire,
  type BookingLike,
} from "../bookingExpiry";

const seconds = (n: number) => n * 1000;
const minutes = (n: number) => n * 60 * 1000;

const SCHEDULED = new Date("2026-05-02T10:00:00.000Z");
const DURATION = 45;
// Threshold = 10:00 + 45min + 30min grace = 11:15:00.000Z
const THRESHOLD = getExpiryThreshold(SCHEDULED, DURATION);

const baseBooking: BookingLike = {
  status: "confirmed",
  scheduled_at: SCHEDULED,
  duration_minutes: DURATION,
};

describe("Boundary precision (second-level around grace threshold)", () => {
  it("threshold is exactly 11:15:00.000Z for 10:00 + 45m + 30m grace", () => {
    expect(THRESHOLD.toISOString()).toBe("2026-05-02T11:15:00.000Z");
  });

  it("1 second BEFORE threshold → does NOT expire", () => {
    const now = new Date(THRESHOLD.getTime() - seconds(1));
    expect(shouldAutoExpire(baseBooking, now)).toBe(false);
  });

  it("EXACTLY at threshold → does NOT expire (strict <)", () => {
    const now = new Date(THRESHOLD.getTime());
    expect(shouldAutoExpire(baseBooking, now)).toBe(false);
  });

  it("1 millisecond AFTER threshold → expires", () => {
    const now = new Date(THRESHOLD.getTime() + 1);
    expect(shouldAutoExpire(baseBooking, now)).toBe(true);
  });

  it("1 second AFTER threshold → expires", () => {
    const now = new Date(THRESHOLD.getTime() + seconds(1));
    expect(shouldAutoExpire(baseBooking, now)).toBe(true);
  });

  it("29 min 59 sec into grace → does NOT expire", () => {
    const now = new Date(SCHEDULED.getTime() + minutes(45) + minutes(29) + seconds(59));
    expect(shouldAutoExpire(baseBooking, now)).toBe(false);
  });

  it("30 min 1 sec into grace → expires", () => {
    const now = new Date(SCHEDULED.getTime() + minutes(45) + minutes(30) + seconds(1));
    expect(shouldAutoExpire(baseBooking, now)).toBe(true);
  });

  it("works symmetrically for pending status at boundary", () => {
    const pending: BookingLike = { ...baseBooking, status: "pending" };
    expect(shouldAutoExpire(pending, new Date(THRESHOLD.getTime() - seconds(1)))).toBe(false);
    expect(shouldAutoExpire(pending, new Date(THRESHOLD.getTime() + seconds(1)))).toBe(true);
  });
});

describe("Session extension / late-start protection", () => {
  it("session started 1 sec before threshold → never expires (even hours later)", () => {
    const sessionRunning: BookingLike = { ...baseBooking, session_started: true };
    const wayLater = new Date(THRESHOLD.getTime() + minutes(180));
    expect(shouldAutoExpire(sessionRunning, wayLater)).toBe(false);
  });

  it("session running 1 sec into grace → does NOT expire", () => {
    const sessionRunning: BookingLike = { ...baseBooking, session_started: true };
    const now = new Date(THRESHOLD.getTime() - minutes(29) - seconds(59));
    expect(shouldAutoExpire(sessionRunning, now)).toBe(false);
  });

  it("teacher started session 25 min late → still inside grace, no expire", () => {
    // Session started at scheduled+25min; not started recorded yet at scheduled+24min
    const now = new Date(SCHEDULED.getTime() + minutes(24));
    expect(shouldAutoExpire({ ...baseBooking, session_started: false }, now)).toBe(false);
  });

  it("session extended past nominal end (running long) → not expired", () => {
    // Lesson runs 60 min over the 45-min slot
    const sessionRunning: BookingLike = { ...baseBooking, session_started: true };
    const now = new Date(SCHEDULED.getTime() + minutes(45 + 60));
    expect(shouldAutoExpire(sessionRunning, now)).toBe(false);
  });

  it("session_started=true overrides ALL time conditions", () => {
    const sessionRunning: BookingLike = { ...baseBooking, session_started: true };
    const now = new Date(SCHEDULED.getTime() + minutes(60 * 24 * 7)); // 1 week later
    expect(shouldAutoExpire(sessionRunning, now)).toBe(false);
  });

  it("session_started=undefined behaves like false (would expire if past threshold)", () => {
    const noFlag: BookingLike = {
      status: "confirmed",
      scheduled_at: SCHEDULED,
      duration_minutes: DURATION,
    };
    const now = new Date(THRESHOLD.getTime() + seconds(1));
    expect(shouldAutoExpire(noFlag, now)).toBe(true);
  });

  it("status changed to in-progress during session — but session_started=true protects it", () => {
    // Even if we observe a transient unexpected status, the session_started flag is the source of truth
    const sessionRunning: BookingLike = {
      ...baseBooking,
      status: "confirmed",
      session_started: true,
    };
    const now = new Date(THRESHOLD.getTime() + minutes(120));
    expect(shouldAutoExpire(sessionRunning, now)).toBe(false);
  });

  it("delayed start by 29 minutes — still inside grace, eligible to start, no expire", () => {
    const now = new Date(SCHEDULED.getTime() + minutes(45 + 29));
    expect(shouldAutoExpire(baseBooking, now)).toBe(false);
  });

  it("if no one ever joined and grace passed by 1 sec → expires (true no-show)", () => {
    const now = new Date(THRESHOLD.getTime() + seconds(1));
    expect(shouldAutoExpire({ ...baseBooking, session_started: false }, now)).toBe(true);
  });
});

describe("Boundary across variable durations", () => {
  it.each([
    { duration: 15, label: "15-min" },
    { duration: 30, label: "30-min" },
    { duration: 45, label: "45-min" },
    { duration: 60, label: "60-min" },
    { duration: 90, label: "90-min" },
    { duration: 120, label: "120-min" },
  ])("$label session: not expired 1s before threshold, expired 1s after", ({ duration }) => {
    const b: BookingLike = { ...baseBooking, duration_minutes: duration };
    const threshold = getExpiryThreshold(SCHEDULED, duration);
    expect(shouldAutoExpire(b, new Date(threshold.getTime() - seconds(1)))).toBe(false);
    expect(shouldAutoExpire(b, new Date(threshold.getTime() + seconds(1)))).toBe(true);
  });
});
