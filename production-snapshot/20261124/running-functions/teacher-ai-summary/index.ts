import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";
import { getGeminiModel, getProviderApiKey } from "../_shared/ai-models.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkEdgeRateLimit } from "../_shared/rate-limit.ts";

const AI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

async function callWithFallback(apiKey: string, messages: any[]): Promise<{ content: string; modelUsed: string }> {
  const model = await getGeminiModel(apiKey);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(AI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages }),
      });
      if (res.status === 429 || res.status === 402) {
        console.warn(`${model} rate-limited, retrying...`);
        continue;
      }
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`AI ${model}: ${res.status} ${txt}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "تعذّر إنشاء ملخص";
      return { content, modelUsed: model };
    } catch (e: any) {
      if (e.message?.includes("429") || e.message?.includes("402")) continue;
      throw e;
    }
  }
  throw new Error("تعذر الوصول إلى نموذج الذكاء الاصطناعي — حاول لاحقاً");
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const rate = checkEdgeRateLimit(req, "teacher-ai-summary", 10);
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

    const { teacher_id, stats } = await req.json();
    const apiKey = await getProviderApiKey("gemini", "GEMINI_API_KEY");
    if (!apiKey) throw new Error("AI provider unavailable");

    const prompt = `أنت محلل أداء معلمين. أنشئ ملخصاً ذكياً موجزاً (4-6 أسطر) باللغة العربية لمعلم بناءً على هذه الإحصائيات. ركّز على نقاط القوة والضعف وتوصيات للإدارة.\n\nالإحصائيات:\n${JSON.stringify(stats, null, 2)}`;

    const { content: summary, modelUsed } = await callWithFallback(apiKey, [
      { role: "system", content: "أنت محلل بيانات معلمين متخصص. ردودك مختصرة ومفيدة بالعربية." },
      { role: "user", content: prompt },
    ]);

    return new Response(JSON.stringify({ summary, teacher_id, model_used: modelUsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("teacher-ai-summary error:", e);
    return new Response(JSON.stringify({ error: "تعذر إنشاء الملخص حالياً" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
