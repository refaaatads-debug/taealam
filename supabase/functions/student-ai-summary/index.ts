// Edge function: AI summary for a student profile in admin dashboard
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";
import { getGeminiModel, getProviderApiKey } from "../_shared/ai-models.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkEdgeRateLimit } from "../_shared/rate-limit.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const rate = checkEdgeRateLimit(req, "student-ai-summary", 10);
  if (!rate.allowed) return new Response(JSON.stringify({ error: "طلبات كثيرة، حاول لاحقاً" }), {
    status: 429,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rate.retryAfterSeconds) },
  });

  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser(token);
    if (!user) return new Response(JSON.stringify({ error: "غير مصرح" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: adminRole } = await userClient.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!adminRole) return new Response(JSON.stringify({ error: "غير مصرح" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const { stats, full } = body || {};
    const apiKey = await getProviderApiKey("gemini", "GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "الخدمة غير متاحة حالياً" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const geminiModel = await getGeminiModel(apiKey);

    const sys = full
      ? `أنت مساعد ذكي لمنصة تعليمية. حلل بيانات الطالب وأرجع JSON فقط بهذا الشكل بدون أي شرح خارجي:
{
  "summary": "نص قصير 3-4 أسطر",
  "churn_risk": "low" | "medium" | "high",
  "suggestions": ["اقتراح 1", "اقتراح 2", ...],
  "strengths": ["نقطة قوة 1", ...],
  "weaknesses": ["نقطة تحسين 1", ...]
}`
      : `أنت مساعد ذكي. أعط ملخصاً موجزاً (3-4 أسطر) عن الطالب بناءً على البيانات التالية. اكتب نصاً عربياً مباشراً بدون JSON.`;

    const userMsg = `بيانات الطالب:\n${JSON.stringify(stats, null, 2)}`;

    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: geminiModel,
        messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
        ...(full ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("student-ai-summary provider error:", resp.status, txt);
      return new Response(JSON.stringify({ error: "تعذر إنشاء الملخص حالياً" }), {
        status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ai = await resp.json();
    const content = ai.choices?.[0]?.message?.content || "";

    if (full) {
      try {
        const parsed = JSON.parse(content);
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({
          summary: content, churn_risk: "low", suggestions: [], strengths: [], weaknesses: [],
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response(JSON.stringify({ summary: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("student-ai-summary error:", e);
    return new Response(JSON.stringify({ error: "تعذر إنشاء الملخص حالياً" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
