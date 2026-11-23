type Call = {
  caller_id: string;
  callee_id: string;
  status: string;
  max_ends_at: string | null;
  transport_provider: string;
};

type Config = {
  agora_enabled: boolean;
};

export function internalCallTokenDenial(
  userId: string,
  call: Call,
  config: Config | null,
  now = Date.now(),
): string | null {
  if (userId !== call.caller_id && userId !== call.callee_id) return "not_participant";
  if (call.transport_provider !== "agora") return "provider_mismatch";
  if (!["connecting", "connected"].includes(call.status)) return "call_not_active";
  if (!config?.agora_enabled) return "agora_not_enabled";
  if (!call.max_ends_at || new Date(call.max_ends_at).getTime() <= now) return "call_expired";
  return null;
}
