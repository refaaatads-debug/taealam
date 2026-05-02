import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `أنت مساعد دعم ذكي لـ"منصة أجيال المعرفة" - منصة تعليمية عربية للحصص الخصوصية أونلاين.

معلومات عن المنصة:
- المنصة توفر حصص خصوصية مباشرة بين الطلاب والمعلمين عبر فيديو/صوت + سبورة تفاعلية
- نظام الباقات: الطالب يشترك بباقة فيها دقائق، تُخصم تلقائياً عند انتهاء الحصة (إذا الحصة < 5 دقائق لا تُحسب)
- المعلمون يحتاجون موافقة الإدارة قبل التدريس
- يوجد نظام واجبات، تقارير AI للحصص، مكافآت للطلاب
- الدفع عبر Stripe (Apple Pay, Mada، بطاقات)
- يمكن طلب سحب الأرباح للمعلمين
- يوجد نظام مكالمات صوتية + شات نصي بين الطالب والمعلم

أجب باختصار ووضوح بالعربية. إذا السؤال خارج نطاق المنصة، اعتذر بلطف ووجّه المستخدم للدعم البشري عبر /support.
لا تخترع معلومات لست متأكداً منها. إذا كان السؤال يحتاج تدخل بشري (مشكلة دفع، شكوى محددة، طلب إلغاء)، اقترح فتح تذكرة دعم.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Invalid messages" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages.slice(-10),
        ],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error:", resp.status, t);
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "تم تجاوز الحد المسموح، حاول لاحقاً" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI request failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content || "عذراً، لم أتمكن من الإجابة الآن.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("help-bot error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
