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

async function evaluateOutput(apiKey: string, inputCtx: string, output: string) {
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `أنت مقيّم لتقارير أداء المعلمين. قيّم: الفائدة، التخصيص، الارتباط بالمدخلات، عدم التعميم. أعطِ درجة 1-10.`,
          },
          { role: "user", content: `Input:\n${inputCtx.slice(0, 600)}\n\nOutput:\n${output.slice(0, 1200)}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "rate_output",
            description: "Rate output quality",
            parameters: {
              type: "object",
              properties: {
                usefulness_score: { type: "number", minimum: 1, maximum: 10 },
                feedback: { type: "string" },
              },
              required: ["usefulness_score", "feedback"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "rate_output" } },
      }),
    });
    if (!resp.ok) { await resp.text(); return { usefulness_score: 5, feedback: "تعذر التقييم" }; }
    const data = await resp.json();
    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    if (tc?.function?.arguments) {
      const p = JSON.parse(tc.function.arguments);
      return { usefulness_score: Math.max(1, Math.min(10, p.usefulness_score || 5)), feedback: p.feedback || "" };
    }
    return { usefulness_score: 5, feedback: "" };
  } catch { return { usefulness_score: 5, feedback: "خطأ في المقيّم" }; }
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

    const inputSummary = `معلم: ${teacher_name}, ساعات: ${total_hours}, حصص: ${total_sessions}, ملغاة: ${cancelled_sessions}, تقييم: ${avg_rating}`;

    let isRegenerated = false;
    let usefulnessScore = 0;
    let evaluatorFeedback = "";

    try {
      const aiResult = await callAIWithRetry(LOVABLE_API_KEY, {
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `أنت محلل أداء تعليمي محترف. أنشئ تقرير أداء مخصص ومفصل عن المعلم "${teacher_name}".
يجب أن يذكر التقرير: اسم المعلم، أرقام دقيقة، ملاحظات محددة بناءً على البيانات.
لا تستخدم عبارات عامة مثل "يجب تحسين الأداء" بدون سياق.
التقرير: ملخص، إنتاجية، إلغاء، تقييمات، نقاط قوة، تحسين، توصيات إدارية.`,
          },
          {
            role: "user",
            content: `بيانات:\n- الاسم: ${teacher_name}\n- الساعات: ${total_hours}\n- الحصص: ${total_sessions}\n- الملغاة: ${cancelled_sessions}\n- الطلاب: ${students_count}\n- التقييم: ${avg_rating}/5 (${total_reviews})\n\nالحصص:\n${sessionsText || "لا توجد"}`,
          },
        ],
      });

      let report = aiResult.result.choices?.[0]?.message?.content || "تعذر إنشاء التقرير";
      const qualityScore = calculateQualityScore(report);

      // Evaluate
      const evaluation = await evaluateOutput(LOVABLE_API_KEY, inputSummary, report);
      usefulnessScore = evaluation.usefulness_score;
      evaluatorFeedback = evaluation.feedback;

      // Regenerate if weak
      if (usefulnessScore < 6) {
        isRegenerated = true;
        const regen = await callAIWithRetry(LOVABLE_API_KEY, {
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `التقرير السابق كان ضعيفاً: "${evaluatorFeedback}". اكتب تقرير مفصل ومخصص جداً عن "${teacher_name}" مع أرقام محددة وتوصيات قابلة للتنفيذ.`,
            },
            {
              role: "user",
              content: `الاسم: ${teacher_name}, ساعات: ${total_hours}, حصص: ${total_sessions}, ملغاة: ${cancelled_sessions}, طلاب: ${students_count}, تقييم: ${avg_rating}/5\n${sessionsText}`,
            },
          ],
        });
        report = regen.result.choices?.[0]?.message?.content || report;
        const reEval = await evaluateOutput(LOVABLE_API_KEY, inputSummary, report);
        usefulnessScore = reEval.usefulness_score;
        evaluatorFeedback = reEval.feedback;
      }

      await supabase.from("ai_logs").insert({
        feature_name: "teacher_performance",
        input_summary: inputSummary.slice(0, 500),
        output_summary: report.slice(0, 200),
        status: "success",
        response_time_ms: aiResult.responseTime,
        quality_score: qualityScore,
        retry_count: aiResult.retryCount,
        usefulness_score: usefulnessScore,
        is_regenerated: isRegenerated,
        evaluator_feedback: evaluatorFeedback.slice(0, 500),
      });

      return new Response(JSON.stringify({ report, quality_score: qualityScore, usefulness_score: usefulnessScore, is_regenerated: isRegenerated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (aiError) {
      const errMsg = aiError instanceof Error ? aiError.message : "Unknown";
      await supabase.from("ai_logs").insert({
        feature_name: "teacher_performance", input_summary: inputSummary.slice(0, 500),
        status: "failed", error_message: errMsg.slice(0, 500), retry_count: 3,
        usefulness_score: 0, is_regenerated: false,
      });
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (admins) for (const a of admins) {
        await supabase.from("notifications").insert({
          user_id: a.user_id, title: "⚠️ فشل تقرير أداء المعلم",
          body: `فشل تقرير ${teacher_name}: ${errMsg.slice(0, 100)}`, type: "ai_error",
        });
      }
      return new Response(JSON.stringify({ error: errMsg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e) {
    console.error("Teacher performance report error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
