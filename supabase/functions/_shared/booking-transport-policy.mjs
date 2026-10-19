export function resolveBookingTransport({
  pinnedProvider,
  sessionStatus,
  agoraEnabled,
}) {
  if (pinnedProvider === "agora") {
    return { provider: "agora", legacyActive: false };
  }

  if (pinnedProvider === "webrtc") {
    return sessionStatus === "in_progress"
      ? { provider: "webrtc", legacyActive: true }
      : { error: "provider_conflict" };
  }

  if (!agoraEnabled) {
    return { error: "agora_disabled" };
  }

  return { provider: "agora", legacyActive: false };
}
