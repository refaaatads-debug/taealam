import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `أنت مساعد ذكي في منصة "أجيال المعرفة" متخصص في حل الواجبات المدرسية من الصور (بما فيها خط اليد).

عند تلقي صورة:
1. اقرأ السؤال بدقة من الصورة (حتى لو كان خط يد).
2. حدد المادة (رياضيات، علوم، لغة، فيزياء...).
3. اشرح الحل خطوة بخطوة بأسلوب تعليمي مبسّط للطالب.
4. أبرز القاعدة أو القانون المستخدم.
5. أعطِ الإجابة النهائية واضحة.
6. أضف نصيحة قصيرة لفهم هذا النوع من المسائل.

أعد الرد بصيغة JSON فقط بهذا الشكل:
{
  "subject": "المادة",
  "question": "نص السؤال كما قرأته",
  "steps": [{"title": "الخطوة 1", "explanation": "..."}],
  "rule": "القاعدة المستخدمة",
  "final_answer": "الإجابة النهائية",
  "tip": "نصيحة للطالب"
}

إذا الصورة غير واضحة أو ليست واجباً، أعد JSON: {"error": "السبب"}.
الرد دائماً بالعربية.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageBase64, extraQuestion } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return new Response(JSON.stringify({ error: "صورة الواجب مطلوبة" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userContent: any[] = [
      {
        type: "text",
        text: extraQuestion?.trim()
          ? `اقرأ الواجب من الصورة وأجب. ملاحظة من الطالب: ${extraQuestion.trim()}`
          : "اقرأ الواجب من الصورة وحلّه خطوة بخطوة.",
      },
      { type: "image_url", image_url: { url: imageBase64 } },
    ];

    const t0 = Date.now();
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "تم تجاوز الحد. حاول بعد قليل." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "نفد رصيد الذكاء الاصطناعي. تواصل مع الإدارة." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "خطأ في الذكاء الاصطناعي" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const text: string = data.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

    // Log usage for audit
    await supabase.from("ai_logs").insert({
      feature_name: "homework_solver",
      user_id: user.id,
      input_summary: extraQuestion?.slice(0, 200) || "image_only",
      output_summary: (parsed.final_answer || parsed.error || "").toString().slice(0, 500),
      response_time_ms: Date.now() - t0,
      status: parsed.error ? "error" : "success",
    }).then(() => {}, () => {});

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("solve-homework error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
