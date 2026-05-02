import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
    const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = { id: claimsData.claims.sub };

    // Check premium subscription with detailed reason classification
    const nowIso = new Date().toISOString();
    const { data: allSubs } = await supabase
      .from("user_subscriptions")
      .select("id, ends_at, remaining_minutes, is_active, subscription_plans:plan_id(tier, name_ar)")
      .eq("user_id", user.id)
      .order("ends_at", { ascending: false });

    const subsList = allSubs || [];
    const activeSubs = subsList.filter((s: any) => s.is_active && s.ends_at > nowIso);
    const premiumSubs = subsList.filter((s: any) => s.subscription_plans?.tier === "premium");
    const validPremium = premiumSubs.find(
      (s: any) => s.is_active && s.ends_at > nowIso && (s.remaining_minutes ?? 0) > 0
    );

    if (!validPremium) {
      let reason_code = "no_subscription";
      let error_msg = "المحادثة الصوتية الحية متاحة فقط لمشتركي الباقة الاحترافية. يرجى الاشتراك أولاً.";

      if (premiumSubs.length === 0 && activeSubs.length > 0) {
        reason_code = "wrong_tier";
        const currentTier = activeSubs[0].subscription_plans?.name_ar || "غير الاحترافية";
        error_msg = `باقتك الحالية (${currentTier}) لا تشمل المحادثة الصوتية الحية. يرجى الترقية إلى الباقة الاحترافية.`;
      } else if (premiumSubs.length > 0) {
        const expiredPremium = premiumSubs.find((s: any) => s.ends_at <= nowIso || !s.is_active);
        const noMinutesPremium = premiumSubs.find((s: any) => s.is_active && s.ends_at > nowIso && (s.remaining_minutes ?? 0) <= 0);
        if (noMinutesPremium) {
          reason_code = "no_minutes";
          error_msg = "نفدت دقائقك في الباقة الاحترافية. يرجى تجديد الاشتراك للمتابعة.";
        } else if (expiredPremium) {
          reason_code = "subscription_expired";
          error_msg = "انتهت صلاحية باقتك الاحترافية. يرجى التجديد لاستئناف المحادثة الصوتية.";
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

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get signed URL for WebSocket connection (more reliable than WebRTC token)
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      { headers: { "xi-api-key": ELEVENLABS_API_KEY } }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("ElevenLabs signed-url error:", response.status, errText);
      return new Response(JSON.stringify({ error: "تعذر الحصول على رابط المحادثة", detail: errText }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { signed_url } = await response.json();
    return new Response(JSON.stringify({ signedUrl: signed_url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-tutor-token error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
