import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function calculateQualityScore(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  let score = 0;
  if (text.length >= 200 && text.length <= 4000) score += 30;
  else if (text.length >= 100) score += 15;
  if (/[\u0600-\u06FF]/.test(text)) score += 15;
  if (text.includes("**") || text.includes("📊") || text.includes("🎯")) score += 20;
  const sentences = text.split(/[.。\n]/).filter(s => s.trim().length > 10);
  const unique = new Set(sentences.map(s => s.trim()));
  score += Math.round((sentences.length > 0 ? unique.size / sentences.length : 1) * 20);
  if (!text.includes("تعذر") && !text.includes("خطأ")) score += 15;
  return Math.min(100, score);
}

async function callAIWithRetry(apiKey: string, body: any, maxRetries = 3) {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const start = Date.now();
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseTime = Date.now() - start;
      if (!resp.ok) {
        const err = await resp.text();
        lastError = new Error(`AI error ${resp.status}: ${err}`);
        if (resp.status === 429 || resp.status === 402) throw lastError;
        continue;
      }
      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || "";
      if (content.length < 50 && attempt < maxRetries - 1) continue;
      return { result: data, retryCount: attempt, responseTime };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (lastError.message.includes("429") || lastError.message.includes("402")) throw lastError;
    }
  }
  throw lastError || new Error("Max retries exceeded");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { teacher_name, total_hours, total_sessions, cancelled_sessions, students_count, avg_rating, total_reviews, sessions } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const sessionsText = (sessions || []).map((s: any) =>
      `- ${s.student} | ${s.subject} | ${new Date(s.date).toLocaleDateString("ar-SA")} | ${s.duration} دقيقة | ${s.status === "completed" ? "مكتملة" : s.status === "cancelled" ? "ملغاة" : "أخرى"}`
    ).join("\n");

    const inputSummary = `معلم: ${teacher_name}, ساعات: ${total_hours}, حصص: ${total_sessions}, تقييم: ${avg_rating}`;

    try {
      const aiResult = await callAIWithRetry(LOVABLE_API_KEY, {
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `أنت محلل أداء تعليمي محترف. أنشئ تقرير أداء منظم ومختصر عن معلم يتضمن:
1. **ملخص الأداء العام** (3-4 جمل)
2. **تحليل الإنتاجية**
3. **تحليل معدل الإلغاء**
4. **تحليل التقييمات**
5. **نقاط القوة** (3-4 نقاط)
6. **فرص التحسين** (2-3 توصيات)
7. **التوصيات الإدارية**

قواعد: لا تكرر الجمل، لا حشو، بالعربية، أسلوب مهني.`,
          },
          {
            role: "user",
            content: `بيانات المعلم:\n- الاسم: ${teacher_name}\n- الساعات: ${total_hours}\n- الحصص: ${total_sessions}\n- الملغاة: ${cancelled_sessions}\n- الطلاب: ${students_count}\n- التقييم: ${avg_rating}/5 (${total_reviews} مراجعة)\n\nالحصص:\n${sessionsText || "لا توجد"}`,
          },
        ],
      });

      const report = aiResult.result.choices?.[0]?.message?.content || "تعذر إنشاء التقرير";
      const qualityScore = calculateQualityScore(report);

      await supabase.from("ai_logs").insert({
        feature_name: "teacher_performance",
        input_summary: inputSummary.slice(0, 500),
        output_summary: report.slice(0, 200),
        status: "success",
        response_time_ms: aiResult.responseTime,
        quality_score: qualityScore,
        retry_count: aiResult.retryCount,
      });

      return new Response(JSON.stringify({ report, quality_score: qualityScore }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (aiError) {
      const errMsg = aiError instanceof Error ? aiError.message : "Unknown";
      await supabase.from("ai_logs").insert({
        feature_name: "teacher_performance",
        input_summary: inputSummary.slice(0, 500),
        status: "failed",
        error_message: errMsg.slice(0, 500),
        retry_count: 3,
      });

      // Notify admins
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (admins) {
        for (const a of admins) {
          await supabase.from("notifications").insert({
            user_id: a.user_id,
            title: "⚠️ فشل تقرير أداء المعلم",
            body: `فشل إنشاء تقرير أداء ${teacher_name}: ${errMsg.slice(0, 100)}`,
            type: "ai_error",
          });
        }
      }

      return new Response(JSON.stringify({ error: errMsg }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("Teacher performance report error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
