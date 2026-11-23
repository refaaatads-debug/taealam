import { issueCappedVoiceTicket } from "../_shared/live-voice-daily-preview.ts";
import { loadDailyVoiceConfig } from "../_shared/live-voice-cap-config.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";
import { getProviderApiKey } from "../_shared/ai-models.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkEdgeRateLimit } from "../_shared/rate-limit.ts";
import { liveVoiceAccountAllowed, liveVoicePremiumAllowed, allowLiveVoiceIssuance } from "../_shared/live-voice-access.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const rate = checkEdgeRateLimit(req, "ai-tutor-token", 5);
  if (!rate.allowed) {
    return new Response(JSON.stringify({ error: "طلبات كثيرة، حاول لاحقاً" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rate.retryAfterSeconds) },
    });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: profile, error: profileError }, { data: roles, error: roleError }] = await Promise.all([
      supabase.from("profiles").select("account_status,is_deleted").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    if (profileError || roleError || !liveVoiceAccountAllowed(profile, roles)) {
      return new Response(JSON.stringify({ error: "الحساب غير مؤهل لبدء المحادثة الصوتية", reason_code: "account_ineligible" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    if (!allowLiveVoiceIssuance(user.id)) {
      return new Response(JSON.stringify({ error: "طلبات كثيرة، حاول بعد دقيقة", reason_code: "user_rate_limited" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60", "Cache-Control": "no-store" },
      });
    }

    // Check premium subscription with detailed reason classification
    const { data: allSubs, error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .select("id, remaining_minutes, is_active, subscription_plans:plan_id(tier, name_ar)")
      .eq("user_id", user.id)
      .order("remaining_minutes", { ascending: false });

    if (subscriptionError) {
      return new Response(JSON.stringify({ error: "تعذر التحقق من الاشتراك", reason_code: "subscription_check_failed" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    const subsList = (allSubs || []).map(s => ({...s,subscription_plans:Array.isArray(s.subscription_plans) ? (s.subscription_plans.length===1 ? s.subscription_plans[0] : null) : s.subscription_plans}));
    const activeSubs = subsList.filter((s: any) => s.is_active);
    const premiumSubs = subsList.filter((s: any) => s.subscription_plans?.tier === "premium");
    const validPremium = subsList.find(liveVoicePremiumAllowed);

    if (!validPremium) {
      let reason_code = "no_subscription";
      let error_msg = "المحادثة الصوتية الحية متاحة فقط لمشتركي الباقة الاحترافية. يرجى الاشتراك أولاً.";

      if (premiumSubs.length === 0 && activeSubs.length > 0) {
        reason_code = "wrong_tier";
        const currentTier = activeSubs[0].subscription_plans?.name_ar || "غير الاحترافية";
        error_msg = `باقتك الحالية (${currentTier}) لا تشمل المحادثة الصوتية الحية. يرجى الترقية إلى الباقة الاحترافية.`;
      } else if (premiumSubs.length > 0) {
        const inactivePremium = premiumSubs.find((s: any) => !s.is_active);
        const noMinutesPremium = premiumSubs.find((s: any) => s.is_active && (s.remaining_minutes ?? 0) <= 0);
        if (noMinutesPremium) {
          reason_code = "no_minutes";
          error_msg = "نفدت دقائقك في الباقة الاحترافية. يرجى تجديد الاشتراك للمتابعة.";
        } else if (inactivePremium) {
          reason_code = "inactive_subscription";
          error_msg = "الباقة الاحترافية غير نشطة. يرجى التواصل مع الدعم.";
        }
      }

      console.warn("ai-tutor-token blocked:", { user_id: user.id, reason_code, subs_count: subsList.length });

      // Persist for support/audit
      await supabase.from("system_logs").insert({
        level: "warn",
        source: "ai_tutor_token",
        message: `Blocked live voice access: ${reason_code}`,
        metadata: {
          user_id: user.id,
          email: user.email,
          reason_code,
          subs_count: subsList.length,
          active_subs: activeSubs.length,
          premium_subs: premiumSubs.length,
        },
      }).then(() => {}, () => {});

      return new Response(JSON.stringify({ error: error_msg, reason_code }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read agent_id from site_settings
    const { data: setting } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "ai_tutor_agent_id")
      .maybeSingle();

    const agentId = (setting?.value || "").trim();
    if (!agentId) {
      return new Response(JSON.stringify({ 
        error: "AI Tutor Agent غير مُعد بعد. يرجى التواصل مع الإدارة." 
      }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ELEVENLABS_API_KEY = await getProviderApiKey("elevenlabs", "ELEVENLABS_API_KEY");
    const ELEVENLABS_API_KEY_BACKUP = await getProviderApiKey("elevenlabs_backup", "ELEVENLABS_API_KEY_BACKUP");
    if (!ELEVENLABS_API_KEY && !ELEVENLABS_API_KEY_BACKUP) {
      return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cap = await loadDailyVoiceConfig();
    if (!cap.enabled || cap.agentId === agentId) throw new Error("cap_not_ready");
    // Use a service client without the incoming Authorization header. Only these
    // RPCs may reserve budget; browsers cannot invoke them directly.
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const providerKey = ELEVENLABS_API_KEY || ELEVENLABS_API_KEY_BACKUP;
    const api = async (path: string) => {
      const r = await fetch("https://api.elevenlabs.io/v1/convai/" + path, {
        headers: { "xi-api-key": providerKey }, signal: AbortSignal.timeout(4000)
      });
      if (!r.ok) throw new Error("provider_unavailable");
      return r.json();
    };
    const result = await issueCappedVoiceTicket(user.id, {
      ...cap,
      getAgentVersion: async (a,v) => {
        const config = await api("agents/"+encodeURIComponent(a)+"?version_id="+encodeURIComponent(v));
        const branches = await api("agents/"+encodeURIComponent(a)+"/branches?include_archived=true");
        const tip = await api("agents/"+encodeURIComponent(a));
        config.isolated_branch_verified = branches.results?.length === 1 &&
          (branches.meta?.total === undefined || branches.meta.total === 1) &&
          branches.results[0].id === config.main_branch_id &&
          tip.version_id === v && tip.main_branch_id === config.main_branch_id;
        return config;
      },
      reserve: async uid => { const r=await admin.rpc("reserve_live_voice",{p_user:uid,p_kind:"live"}); if(r.error)throw Error("reservation_failed"); return r.data; },
      mint: async (a,v) => (await api("conversation/get-signed-url?"+new URLSearchParams({agent_id:a,version_id:v,include_conversation_id:"true"}))).signed_url,
      bind: async (id,c) => { const r=await admin.rpc("bind_live_voice",{p_reservation:id,p_conversation:c}); if(r.error)throw Error("binding_failed"); return r.data===true; }
    });
    return new Response(JSON.stringify(result.allowed ? result : {
      error: "انتهى الحد اليومي للصوت أو توجد محادثة محجوزة. يمكنك المتابعة بالكتابة.",
      reason_code: "reason" in result ? result.reason : "voice_unavailable"
    }), {status:result.allowed?200:429,headers:{...corsHeaders,"Content-Type":"application/json","Cache-Control":"no-store"}});
  } catch (e) {
    console.error("ai-tutor-token request failed");
    return new Response(JSON.stringify({ error: "تعذر بدء المحادثة الصوتية" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
