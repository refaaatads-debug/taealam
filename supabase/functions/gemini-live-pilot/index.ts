// PREPARATION ONLY. Deploying this function is not approved.
import { GoogleGenAI } from 'npm:@google/genai@3.6.1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?bundle';
import { getCorsHeaders } from '../_shared/cors.ts';
import { checkEdgeRateLimit } from '../_shared/rate-limit.ts';
import { liveVoiceAccountAllowed, liveVoicePremiumAllowed } from '../_shared/live-voice-access.ts';
import { getProviderApiKey } from '../_shared/ai-models.ts';
import { issueGeminiPilotTicket } from '../_shared/gemini-live-pilot.ts';

Deno.serve(async req => {
  const cors = getCorsHeaders(req);
  const reply = (status: number, body: unknown) => Response.json(body, {
    status, headers: { ...cors, 'Cache-Control': 'no-store' },
  });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply(405, { reason_code: 'method_not_allowed' });
  // These are explicit release gates, never inferred from having a key.
  if (Deno.env.get('GEMINI_LIVE_PILOT_ENABLED') !== 'true' ||
      Deno.env.get('GEMINI_LIVE_CUTOFF_VERIFIED') !== 'true' ||
      Deno.env.get('GEMINI_LIVE_ADULT_TEST_ONLY_ACK') !== 'true') {
    return reply(503, { reason_code: 'pilot_disabled' });
  }
  if (!checkEdgeRateLimit(req, 'gemini-live-pilot', 3).allowed) return reply(429, { reason_code: 'rate_limited' });
  try {
    const bearer = req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!bearer) return reply(401, { reason_code: 'unauthorized' });
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error } = await admin.auth.getUser(bearer);
    if (error || !user) return reply(401, { reason_code: 'unauthorized' });
    const testers = (Deno.env.get('GEMINI_LIVE_TEST_USER_IDS') || '').split(',').map(x => x.trim()).filter(Boolean);
    // Empty allowlist denies everyone. No automatic production rollout.
    if (!testers.includes(user.id)) return reply(403, { reason_code: 'not_pilot_tester' });
    const [profile, roles, subs] = await Promise.all([
      admin.from('profiles').select('account_status,is_deleted').eq('user_id', user.id).maybeSingle(),
      admin.from('user_roles').select('role').eq('user_id', user.id),
      admin.from('user_subscriptions').select('remaining_minutes,is_active,subscription_plans:plan_id(tier)').eq('user_id', user.id),
    ]);
    if (profile.error || roles.error || subs.error) return reply(503, { reason_code: 'eligibility_unavailable' });
    if (!liveVoiceAccountAllowed(profile.data, roles.data) ||
        !roles.data?.some(r => r.role === 'student') || !subs.data?.some(liveVoicePremiumAllowed)) {
      return reply(403, { reason_code: 'account_ineligible' });
    }
    const key = await getProviderApiKey('gemini', 'GEMINI_API_KEY');
    if (!key) return reply(503, { reason_code: 'provider_not_configured' });
    const ai = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: 'v1beta', timeout: 8000 } });
    const result = await issueGeminiPilotTicket({
      now: Date.now,
      reserve: async () => {
        // Same atomic Riyadh-day ledger as ElevenLabs web + mobile TTS.
        // Deliberately retain the full debit. No untrusted client refunds.
        const r = await admin.rpc('reserve_live_voice', { p_user: user.id, p_kind: 'live' });
        if (r.error) throw Error('reservation_failed');
        return r.data;
      },
      mint: config => ai.authTokens.create({ config: config as Parameters<typeof ai.authTokens.create>[0]['config'] }),
    });
    return reply(result.allowed ? 200 : 429, result);
  } catch {
    // Do not log token, API key, student data or raw upstream responses.
    console.error('gemini-live-pilot issuance failed');
    return reply(503, { reason_code: 'pilot_unavailable' });
  }
});
