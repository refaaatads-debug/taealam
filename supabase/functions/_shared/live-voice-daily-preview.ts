// Off production. Requires approved release after cutoff and substitution gates.
// Provider signature branch-binding remains unverified; do not claim bypass-proof.
export type VoiceCapDependencies = {
  enabled: boolean;
  agentId: string;
  versionId: string;
  getAgentVersion: (agentId: string, versionId: string) => Promise<any>;
  reserve: (userId: string) => Promise<{ allowed: boolean; reason?: string; reservation_id?: string; max_seconds?: number }>;
  mint: (agentId: string, versionId: string) => Promise<string>;
  bind: (reservationId: string, conversationId: string) => Promise<boolean>;
};

export async function issueCappedVoiceTicket(authenticatedUserId: string, deps: VoiceCapDependencies) {
  if (!deps.enabled || !deps.agentId || !deps.versionId) throw new Error('cap_not_ready');
  if (!authenticatedUserId) throw new Error('unauthorized');
  // Resolve the EXACT immutable version, not mutable branch tip or main config.
  const config = await deps.getAgentVersion(deps.agentId, deps.versionId);
  if (config.isolated_branch_verified !== true || !config.main_branch_id || config.branch_id !== config.main_branch_id || config.agent_id !== deps.agentId || config.version_id !== deps.versionId ||
      config.conversation_config?.conversation?.max_duration_seconds !== 299 ||
      config.platform_settings?.auth?.enable_auth !== true ||
      config.platform_settings?.overrides?.conversation_config_override?.conversation?.max_duration_seconds !== false ||
      config.platform_settings?.overrides?.conversation_config_override?.agent?.prompt?.prompt !== false) {
    throw new Error('unsafe_provider_version');
  }
  const reservation = await deps.reserve(authenticatedUserId);
  if (!reservation.allowed) return reservation;
  if (reservation.max_seconds !== 300 || !reservation.reservation_id) throw new Error('unsafe_reservation');
  // Failures leave the debit in place, never refund a possibly issued ticket.
  const signedUrl = await deps.mint(deps.agentId, deps.versionId);
  const u = new URL(signedUrl);
  const conversationId = u.searchParams.get('conversation_id');
  if (u.protocol !== 'wss:' || u.hostname !== 'api.elevenlabs.io' ||
      u.searchParams.get('branch_id') !== config.main_branch_id || u.searchParams.get('agent_id') !== deps.agentId || !u.searchParams.get('conversation_signature') ||
      !conversationId?.startsWith('conv_')) throw new Error('unsafe_signed_url');
  if (!await deps.bind(reservation.reservation_id, conversationId)) throw new Error('binding_failed');
  // Preserve existing web response contract. A countdown can be added separately
  // for UX but is never the enforcement mechanism.
  return { allowed: true, signedUrl, maxSeconds: 299 };
}

export async function reconcileCappedVoice(
  conversationId: string,
  expectedAgent: string,
  expectedVersion: string,
  fetchProviderConversation: (id: string) => Promise<any>,
  settle: (id: string, seconds: number) => Promise<unknown>,
) {
  const call = await fetchProviderConversation(conversationId);
  if (call.conversation_id !== conversationId || call.agent_id !== expectedAgent || call.version_id !== expectedVersion)
    throw new Error('conversation_mismatch');
  // Webhook may trigger this read, but only provider-authenticated GET data sets usage.
  if (!['done', 'failed'].includes(call.status)) return { pending: true };
  const seconds = call.metadata?.call_duration_secs;
  if (!Number.isInteger(seconds) || seconds < 0) throw new Error('invalid_duration');
  return settle(conversationId, seconds);
}
