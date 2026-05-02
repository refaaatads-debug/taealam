import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { teacher_id, stats } = await req.json();
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const prompt = `أنت محلل أداء معلمين. أنشئ ملخصاً ذكياً موجزاً (4-6 أسطر) باللغة العربية لمعلم بناءً على هذه الإحصائيات. ركّز على نقاط القوة والضعف وتوصيات للإدارة.\n\nالإحصائيات:\n${JSON.stringify(stats, null, 2)}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "أنت محلل بيانات معلمين متخصص. ردودك مختصرة ومفيدة بالعربية." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`AI gateway: ${res.status} ${txt}`);
    }
    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content || "تعذّر إنشاء ملخص";

    return new Response(JSON.stringify({ summary, teacher_id }), {
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
