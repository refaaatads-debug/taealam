// Edge function: AI summary for a student profile in admin dashboard
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { stats, full } = body || {};
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
        ...(full ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return new Response(JSON.stringify({ error: "AI gateway error", detail: txt }), {
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
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
