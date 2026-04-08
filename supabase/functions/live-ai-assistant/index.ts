import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, subject, action, elapsed_minutes } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "analyze_chat") {
      systemPrompt = `أنت مساعد ذكي للمعلم أثناء الحصة المباشرة في منصة "تعلّم". مهمتك تحليل رسائل الدردشة وتقديم اقتراحات للمعلم.

أجب بصيغة JSON فقط:
{
  "student_understanding": "high" | "medium" | "low",
  "suggestions": ["اقتراح 1", "اقتراح 2"],
  "key_question": "سؤال مهم إن وجد أو null",
  "engagement_level": "active" | "passive" | "confused"
}`;
      const recentMessages = (messages || []).slice(-10);
      userPrompt = `المادة: ${subject || "غير محددة"}\nالوقت المنقضي: ${elapsed_minutes || 0} دقيقة\n\nآخر رسائل الدردشة:\n${recentMessages.map((m: any) => `${m.sender}: ${m.text}`).join("\n")}`;
    } else if (action === "help_explain") {
      systemPrompt = `أنت مساعد تعليمي ذكي. المعلم يطلب مساعدة في الشرح. قدم:
1. شرح مبسط للموضوع
2. مثال عملي من الحياة اليومية
3. سؤال تفاعلي للطالب

أجب بصيغة JSON:
{
  "explanation": "شرح مبسط",
  "example": "مثال عملي",
  "question": "سؤال للطالب"
}`;
      const recentMessages = (messages || []).slice(-5);
      userPrompt = `المادة: ${subject || "غير محددة"}\n\nسياق المحادثة:\n${recentMessages.map((m: any) => `${m.sender}: ${m.text}`).join("\n")}`;
    } else if (action === "mini_summary") {
      systemPrompt = `أنت مساعد ذكي. لخص ما حدث في الجلسة حتى الآن في 3 نقاط قصيرة بالعربية.

أجب بصيغة JSON:
{
  "summary_points": ["نقطة 1", "نقطة 2", "نقطة 3"],
  "student_score": 1-10,
  "recommendation": "توصية للمعلم"
}`;
      userPrompt = `المادة: ${subject || "غير محددة"}\nالوقت: ${elapsed_minutes || 0} دقيقة\n\nجميع الرسائل:\n${(messages || []).map((m: any) => `${m.sender}: ${m.text}`).join("\n")}`;
    } else if (action === "silence_suggestion") {
      systemPrompt = `أنت مساعد ذكي للمعلم. لاحظنا عدم تفاعل الطالب لمدة دقيقتين. اقترح سؤالاً تفاعلياً مناسباً للمادة.

أجب بصيغة JSON:
{
  "suggested_question": "سؤال تفاعلي",
  "ice_breaker": "عبارة لكسر الجمود"
}`;
      userPrompt = `المادة: ${subject || "غير محددة"}\nالوقت: ${elapsed_minutes || 0} دقيقة`;
    } else {
      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    // Parse JSON from response
    let parsed: any = {};
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      parsed = { raw: content };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("live-ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
