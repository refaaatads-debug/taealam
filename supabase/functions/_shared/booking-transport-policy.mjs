export function resolveBookingTransport({
  pinnedProvider,
  sessionStatus,
  agoraEnabled,
}) {
  const alreadyStarted = sessionStatus === "in_progress";

  if (pinnedProvider === "agora") {
    return { provider: "agora", legacyActive: false };
  }

  if (pinnedProvider === "webrtc") {
    return alreadyStarted
      ? { provider: "webrtc", legacyActive: true }
      : { error: "provider_conflict" };
  }

  if (alreadyStarted) {
    return { provider: "webrtc", legacyActive: true };
  }

  if (!agoraEnabled) {
    return { error: "agora_disabled" };
  }

  return { provider: "agora", legacyActive: false };
}
