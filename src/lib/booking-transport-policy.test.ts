import { describe, expect, it } from "vitest";
import { resolveBookingTransport } from "../../supabase/functions/_shared/booking-transport-policy.mjs";

describe("booking transport policy", () => {
  it("selects Agora for multiple distinct new bookings", () => {
    const bookings = [
      "10000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000002",
    ];

    const selections = bookings.map(() =>
      resolveBookingTransport({
        pinnedProvider: null,
        sessionStatus: "not_started",
        agoraEnabled: true,
      }),
    );

    expect(selections).toEqual([
      { provider: "agora", legacyActive: false },
      { provider: "agora", legacyActive: false },
    ]);
  });

  it("keeps the same pinned Agora provider for the other participant", () => {
    expect(
      resolveBookingTransport({
        pinnedProvider: "agora",
        sessionStatus: "in_progress",
        agoraEnabled: true,
      }),
    ).toEqual({ provider: "agora", legacyActive: false });
  });

  it("selects Agora for an unpinned booking even when its status is in progress", () => {
    expect(
      resolveBookingTransport({
        pinnedProvider: null,
        sessionStatus: "in_progress",
        agoraEnabled: true,
      }),
    ).toEqual({ provider: "agora", legacyActive: false });
  });

  it("preserves an active session already pinned to WebRTC", () => {
    expect(
      resolveBookingTransport({
        pinnedProvider: "webrtc",
        sessionStatus: "in_progress",
        agoraEnabled: true,
      }),
    ).toEqual({ provider: "webrtc", legacyActive: true });
  });

  it("rejects starting a new session pinned to WebRTC", () => {
    expect(
      resolveBookingTransport({
        pinnedProvider: "webrtc",
        sessionStatus: "not_started",
        agoraEnabled: true,
      }),
    ).toEqual({ error: "provider_conflict" });
  });

  it("fails closed instead of selecting WebRTC when Agora is disabled", () => {
    expect(
      resolveBookingTransport({
        pinnedProvider: null,
        sessionStatus: "not_started",
        agoraEnabled: false,
      }),
    ).toEqual({ error: "agora_disabled" });
  });
});
