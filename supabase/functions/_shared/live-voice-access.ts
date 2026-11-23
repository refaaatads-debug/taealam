export function liveVoiceAccountAllowed(
  profile: { account_status?: string | null; is_deleted?: boolean | null } | null,
  roles: unknown[] | null,
): boolean {
  return !!profile && profile.account_status === "active" && profile.is_deleted === false && !!roles?.length;
}

export function liveVoicePremiumAllowed(subscription: any): boolean {
  const tier = Array.isArray(subscription?.subscription_plans)
    ? subscription.subscription_plans[0]?.tier
    : subscription?.subscription_plans?.tier;
  const minutes = subscription?.remaining_minutes;
  // Subscription minutes are prepaid. Do not invent an expiry-date restriction.
  return tier === "premium" && subscription?.is_active === true &&
    typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0;
}

// Best effort per-isolate burst control, NOT a durable per-user session lock.
const issuance = new Map<string, number[]>();
export function allowLiveVoiceIssuance(userId: string, now = Date.now()): boolean {
  const recent = (issuance.get(userId) ?? []).filter((at) => now - at < 60_000);
  if (recent.length >= 3) return false;
  recent.push(now);
  issuance.set(userId, recent);
  // Bound memory in long-lived isolates. Active users retain their window.
  if (issuance.size > 10_000) {
    for (const [id, times] of issuance) {
      if ((times.at(-1) ?? 0) <= now - 60_000) issuance.delete(id);
    }
  }
  return true;
}
