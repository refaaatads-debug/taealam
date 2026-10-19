export type BookingTransport =
  | { provider: "agora"; legacyActive: false }
  | { provider: "webrtc"; legacyActive: true }
  | { error: "provider_conflict" | "agora_disabled" };

export function resolveBookingTransport(input: {
  pinnedProvider: string | null;
  sessionStatus: string | null;
  agoraEnabled: boolean;
}): BookingTransport;
