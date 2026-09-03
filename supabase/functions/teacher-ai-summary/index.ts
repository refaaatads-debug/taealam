import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getGeminiModel, getProviderApiKey } from "../_shared/ai-models.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { teacher_id, stats } = await req.json();
    const apiKey = await getProviderApiKey("gemini", "GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY missing");

    const prompt = `أنت محلل أداء معلمين. أنشئ ملخصاً ذكياً موجزاً (4-6 أسطر) باللغة العربية لمعلم بناءً على هذه الإحصائيات. ركّز على نقاط القوة والضعف وتوصيات للإدارة.\n\nالإحصائيات:\n${JSON.stringify(stats, null, 2)}`;

    const { content: summary, modelUsed } = await callWithFallback(apiKey, [
      { role: "system", content: "أنت محلل بيانات معلمين متخصص. ردودك مختصرة ومفيدة بالعربية." },
      { role: "user", content: prompt },
    ]);

    return new Response(JSON.stringify({ summary, teacher_id, model_used: modelUsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
