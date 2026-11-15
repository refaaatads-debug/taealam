import { describe, expect, it } from "vitest";
import { resolveSessionTransportProvider } from "../sessionTransportPolicy";

describe("resolveSessionTransportProvider", () => {
  it("selects Agora for complete new-session credentials", () => {
    expect(resolveSessionTransportProvider({
      provider: "agora",
      token: "rtc-token",
      appId: "app-id",
      channel: "booking-channel",
      uid: "student-id",
    })).toBe("agora");
  });

  it("keeps WebRTC only when the server pins an active legacy booking", () => {
    expect(resolveSessionTransportProvider({ provider: "webrtc", legacyActive: true })).toBe("webrtc");
  });

  it.each([
    { provider: "webrtc", legacyActive: false },
    { provider: "webrtc" },
    { provider: "agora", token: "token-only" },
    null,
  ])("rejects unsupported transport responses without a fallback", (response) => {
    expect(() => resolveSessionTransportProvider(response)).toThrow();
  });
});
