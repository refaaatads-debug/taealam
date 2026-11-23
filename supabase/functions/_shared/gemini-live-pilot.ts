// PREPARATION ONLY. No production route uses this adapter.
export const GEMINI_LIVE_MODEL = 'gemini-3.8-live';
export const GEMINI_LIVE_SECONDS = 300;
export const GEMINI_ARABIC_INSTRUCTION = 'أنت معلم تعليمي للطلاب. تحدث بالعربية الفصحى المبسطة فقط. اشرح فكرة واحدة بإيجاز ثم اسأل سؤال فهم. لا تطلب معلومات شخصية. لا تدّع معرفة كتاب أو منهج لم يقدمه الطالب. لا تقدم إجابات ضارة. إذا كان السؤال خطراً فوجه الطالب إلى شخص بالغ موثوق.';

export function geminiTokenConfig(issuedAtMs: number) {
  if (!Number.isFinite(issuedAtMs) || issuedAtMs <= 0) throw Error('invalid_clock');
  return {
    uses: 1,
    // Absolute expiry from issuance, not 5 min after a delayed connection.
    expireTime: new Date(issuedAtMs + GEMINI_LIVE_SECONDS * 1000).toISOString(),
    newSessionExpireTime: new Date(issuedAtMs + 60_000).toISOString(),
    liveConnectConstraints: {
      model: GEMINI_LIVE_MODEL,
      config: {
        responseModalities: ['AUDIO'],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: GEMINI_ARABIC_INSTRUCTION,
        // No tools, grounding, resumption, video or compression in the pilot.
      },
    },
    // Omit lockAdditionalFields: SDK's default locks the whole setup.
  };
}

export type GeminiReservation = { allowed: boolean; reason?: string; reservation_id?: string; max_seconds?: number };
export async function issueGeminiPilotTicket(deps: {
  now: () => number;
  reserve: () => Promise<GeminiReservation>;
  mint: (config: ReturnType<typeof geminiTokenConfig>) => Promise<{ name?: string; expireTime?: string }>;
}) {
  const issuedAt = deps.now();
  const reservation = await deps.reserve();
  if (!reservation.allowed) return reservation;
  if (!reservation.reservation_id || reservation.max_seconds !== 300) throw Error('unsafe_reservation');
  const config = geminiTokenConfig(issuedAt);
  const token = await deps.mint(config);
  // Do not refund a possibly minted token on ambiguous errors.
  if (!token.name?.startsWith('auth_tokens/') || !token.expireTime ||
      Date.parse(token.expireTime) > Date.parse(config.expireTime) ||
      !Number.isFinite(Date.parse(token.expireTime)) || deps.now() >= issuedAt + 60_000) {
    throw Error('unsafe_ephemeral_token');
  }
  return { allowed: true, provider: 'gemini', model: GEMINI_LIVE_MODEL,
    token: token.name, expiresAt: token.expireTime,
    newSessionExpiresAt: config.newSessionExpireTime, maxSeconds: 300 };
}
