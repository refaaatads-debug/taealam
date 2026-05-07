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

// Vision-capable Groq models in priority order
const VISION_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
];

// Gemini vision fallback
async function callGeminiVision(base64Data: string, mimeType: string, userText: string, apiKey: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{
            role: "user",
            parts: [
              { text: userText },
              { inline_data: { mime_type: mimeType, data: base64Data } }
            ]
          }],
          generationConfig: { response_mime_type: "application/json" }
        }),
      }
    );
    if (!resp.ok) { console.error("Gemini vision error:", resp.status, await resp.text()); return null; }
    const data = await resp.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) { console.error("Gemini vision exception:", e); return null; }
}

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

    // Subscription check
    const nowIso = new Date().toISOString();
    const { data: subs } = await supabase
      .from("user_subscriptions")
      .select("id, ends_at, remaining_minutes, is_active, subscription_plans:plan_id(tier, name_ar)")
      .eq("user_id", user.id);

    const subsList = (subs as any[]) || [];
    const eligibleTiers = ["standard", "premium"];
    const eligibleSubs = subsList.filter((s: any) => eligibleTiers.includes(s.subscription_plans?.tier));
    const validSub = eligibleSubs.find(
      (s: any) => s.is_active && s.ends_at > nowIso && (s.remaining_minutes ?? 0) > 0
    );

    if (!validSub) {
      const activeSubs = subsList.filter((s: any) => s.is_active && s.ends_at > nowIso);
      let reason_code = "no_subscription";
      let error_msg = "هذه الميزة متاحة فقط للباقات المتقدمة والاحترافية. يرجى الاشتراك أو الترقية.";
      if (eligibleSubs.length === 0 && activeSubs.length > 0) {
        reason_code = "wrong_tier";
        error_msg = "مساعد الواجبات البصري متاح فقط للباقات المتقدمة والاحترافية. يرجى ترقية باقتك.";
      } else if (eligibleSubs.length > 0) {
        const noMinutes = eligibleSubs.find((s: any) => s.is_active && s.ends_at > nowIso && (s.remaining_minutes ?? 0) <= 0);
        if (noMinutes) { reason_code = "no_minutes"; error_msg = "نفدت دقائق باقتك. يرجى تجديد الاشتراك."; }
        else { reason_code = "subscription_expired"; error_msg = "انتهت صلاحية باقتك. يرجى تجديد الاشتراك."; }
      }
      return new Response(JSON.stringify({ error: error_msg, reason_code }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageBase64, extraQuestion } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return new Response(JSON.stringify({ error: "صورة الواجب مطلوبة" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract base64 data from data URL
    let base64Data = imageBase64;
    let mimeType = "image/jpeg";
    if (imageBase64.startsWith("data:")) {
      const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/s);
      if (match) { mimeType = match[1]; base64Data = match[2].trim(); }
    }

    const userText = extraQuestion?.trim()
      ? `اقرأ الواجب من الصورة وأجب. ملاحظة من الطالب: ${extraQuestion.trim()}. أعد الرد بصيغة JSON فقط.`
      : "اقرأ الواجب من الصورة وحلّه خطوة بخطوة. أعد الرد بصيغة JSON فقط.";

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

    const t0 = Date.now();
    let rawText: string | null = null;

    // Try Groq vision models
    for (const model of VISION_MODELS) {
      try {
        const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: [
                  { type: "text", text: userText },
                  { type: "image_url", image_url: { url: imageBase64.startsWith("data:") ? imageBase64 : `data:${mimeType};base64,${base64Data}` } }
                ]
              }
            ],
            max_tokens: 1500,
            response_format: { type: "json_object" },
          }),
        });
        if (resp.status === 429) { console.log(`${model} rate-limited`); continue; }
        if (!resp.ok) { console.error(`${model} error:`, resp.status, await resp.text()); continue; }
        const data = await resp.json();
        rawText = data?.choices?.[0]?.message?.content || null;
        if (rawText) { console.log("Solved with Groq vision:", model); break; }
      } catch (e) { console.error(`${model} exception:`, e); }
    }

    // Fallback to Gemini vision
    if (!rawText) {
      console.log("Groq vision failed, trying Gemini...");
      rawText = await callGeminiVision(base64Data, mimeType, userText, GEMINI_API_KEY);
    }

    if (!rawText) {
      return new Response(JSON.stringify({ error: "تعذّر تحليل الصورة، حاول مرة أخرى" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: any = {};
    try { parsed = JSON.parse(rawText); } catch { parsed = { raw: rawText }; }

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
