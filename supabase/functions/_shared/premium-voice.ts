export type VoiceSubscription = { is_active?: boolean; remaining_minutes?: number | null; subscription_plans?: { tier?: string } | null };
export function hasPremiumVoice(subscriptions: VoiceSubscription[]): boolean {
 return subscriptions.some(s=>s.is_active===true && (s.remaining_minutes??0)>0 && s.subscription_plans?.tier==='premium');
}
export function shouldGenerateTutorAudio(requested: unknown, subscriptions: VoiceSubscription[]): boolean {
 // Older clients omit speak and expect audio. Keep their text response working,
 // but never generate paid voice unless server-verified premium entitlement exists.
 return requested!==false && hasPremiumVoice(subscriptions);
}
