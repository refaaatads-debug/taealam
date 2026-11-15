export type SessionTransportProvider = "unknown" | "agora" | "webrtc";

export function resolveSessionTransportProvider(value: unknown): Exclude<SessionTransportProvider, "unknown"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ردّ مزوّد الاتصال غير صالح.");
  }

  const response = value as Record<string, unknown>;
  if (
    response.provider === "agora"
    && typeof response.token === "string" && response.token.length > 0
    && typeof response.appId === "string" && response.appId.length > 0
    && typeof response.channel === "string" && response.channel.length > 0
    && ((typeof response.uid === "string" && response.uid.length > 0)
      || (typeof response.uid === "number" && Number.isFinite(response.uid) && response.uid > 0))
  ) {
    return "agora";
  }

  if (response.provider === "webrtc" && response.legacyActive === true) {
    return "webrtc";
  }

  throw new Error("مزود الاتصال للحصة غير متاح أو غير مثبت لهذا الحجز.");
}
