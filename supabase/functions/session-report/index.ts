import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---------- AI call with retry ----------
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
        const errText = await resp.text();
        lastError = new Error(`AI error ${resp.status}: ${errText}`);
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

// ---------- AI Evaluator – rates real quality ----------
async function evaluateOutput(
  apiKey: string,
  inputContext: string,
  aiOutput: string,
): Promise<{ usefulness_score: number; feedback: string }> {
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `أنت مقيّم جودة لمخرجات ذكاء اصطناعي تعليمي. قيّم التقرير التالي بدقة.

معايير التقييم (كل معيار من 1-10):
1. الفائدة: هل يحتوي معلومات مفيدة وقابلة للتنفيذ؟
2. التخصيص: هل يذكر تفاصيل خاصة بالجلسة (اسم المادة، أرقام، نقاط محددة)؟
3. الارتباط بالمدخلات: هل المخرجات مرتبطة فعلاً بالبيانات المدخلة؟
4. عدم التعميم: هل يتجنب العبارات العامة مثل "يجب تحسين الأداء" بدون تفاصيل؟

أجب باستخدام الأداة المتاحة فقط.`,
          },
          {
            role: "user",
            content: `--- بيانات الجلسة (Input) ---\n${inputContext.slice(0, 800)}\n\n--- التقرير المُنتج (Output) ---\n${aiOutput.slice(0, 1500)}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "rate_output",
            description: "Rate the AI output quality",
            parameters: {
              type: "object",
              properties: {
                usefulness_score: { type: "number", minimum: 1, maximum: 10, description: "Overall usefulness 1-10" },
                feedback: { type: "string", description: "Brief feedback in Arabic" },
              },
              required: ["usefulness_score", "feedback"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "rate_output" } },
      }),
    });

    if (!resp.ok) {
      await resp.text();
      return { usefulness_score: 5, feedback: "تعذر التقييم" };
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return {
        usefulness_score: Math.max(1, Math.min(10, parsed.usefulness_score || 5)),
        feedback: parsed.feedback || "",
      };
    }
    return { usefulness_score: 5, feedback: "تعذر تحليل الاستجابة" };
  } catch (e) {
    console.error("Evaluator error:", e);
    return { usefulness_score: 5, feedback: "خطأ في المقيّم" };
  }
}

// ---------- Surface-level quality (fast, no AI) ----------
function calculateQualityScore(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  let score = 0;
  const len = text.length;
  if (len >= 200 && len <= 3000) score += 30;
  else if (len >= 100) score += 15;
  else score += 5;
  if (text.includes("📋") || text.includes("📊") || text.includes("🎯")) score += 20;
  const sentences = text.split(/[.。\n]/).filter(s => s.trim().length > 10);
  const unique = new Set(sentences.map(s => s.trim()));
  score += Math.round((sentences.length > 0 ? unique.size / sentences.length : 1) * 20);
  if (/[\u0600-\u06FF]/.test(text)) score += 15;
  if (!text.includes("تعذر") && !text.includes("خطأ")) score += 15;
  return Math.min(100, score);
}

// ---------- Main ----------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { booking_id, session_stats } = await req.json();
    if (!booking_id) throw new Error("booking_id is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ---- Gather data ----
    const { data: booking } = await supabase.from("bookings").select("*, subjects(name)").eq("id", booking_id).single();
    if (!booking) throw new Error("Booking not found");

    const { data: session } = await supabase.from("sessions").select("*").eq("booking_id", booking_id).single();

    const { data: allMessages } = await supabase
      .from("chat_messages")
      .select("content, sender_id, created_at, is_filtered")
      .eq("booking_id", booking_id)
      .order("created_at");

    const totalMessages = allMessages?.length || 0;
    const teacherMessages = allMessages?.filter(m => m.sender_id === booking.teacher_id).length || 0;
    const studentMessages = allMessages?.filter(m => m.sender_id === booking.student_id).length || 0;
    const filteredMessages = allMessages?.filter(m => m.is_filtered).length || 0;

    const { count: violationsCount } = await supabase
      .from("violations").select("id", { count: "exact", head: true }).eq("booking_id", booking_id);

    const chatSummary = allMessages?.filter(m => !m.is_filtered).map(m => m.content).join("\n") || "لم يتم تبادل رسائل";
    const subjectName = booking.subjects?.name || "مادة عامة";
    const durationMin = session?.duration_minutes || booking.duration_minutes || 45;
    const teacherSpeakingTime = session_stats?.teacher_speaking_seconds || 0;
    const studentSpeakingTime = session_stats?.student_speaking_seconds || 0;
    const totalViolations = (violationsCount || 0) + (filteredMessages || 0);

    // ---- Performance score ----
    let performanceScore = 80;
    if (totalViolations >= 5) performanceScore -= 40;
    else if (totalViolations >= 3) performanceScore -= 25;
    else if (totalViolations >= 1) performanceScore -= 10;
    if (totalMessages > 10) performanceScore += 10;
    if (totalMessages > 20) performanceScore += 5;
    if (durationMin >= 40) performanceScore += 5;
    if (durationMin >= 45) performanceScore += 5;
    performanceScore = Math.max(0, Math.min(100, performanceScore));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const inputContext = `المادة: ${subjectName}\nمدة: ${durationMin} دقيقة\nرسائل: ${totalMessages} (معلم ${teacherMessages}، طالب ${studentMessages})\nمخالفات: ${totalViolations}\nالمحادثة:\n${chatSummary.slice(0, 1200)}`;

    const systemPrompt = `أنت محلل تعليمي محترف. أنشئ تقريراً مفصلاً ومخصصاً عن حصة تعليمية.

التقرير يجب أن يحتوي على:
📋 ملخص الحصة (3-4 جمل تذكر المادة والتفاصيل المحددة)
📊 إحصائيات الحصة (مدة: ${durationMin}د، رسائل: ${totalMessages}، مخالفات: ${totalViolations})
🎯 تقييم أداء المعلم (استخدم بيانات محددة)
💬 ملاحظات على التفاعل (أذكر نقاط محددة من المحادثة)
⚠️ المخالفات السلوكية
📝 توصيات مخصصة وقابلة للتنفيذ

درجة الأداء: ${performanceScore}/100
${teacherSpeakingTime > 0 ? `وقت تحدث المعلم: ${Math.floor(teacherSpeakingTime / 60)} دقيقة` : ""}
${studentSpeakingTime > 0 ? `وقت تحدث الطالب: ${Math.floor(studentSpeakingTime / 60)} دقيقة` : ""}

قواعد حاسمة:
- اذكر اسم المادة "${subjectName}" بوضوح
- لا تستخدم عبارات عامة بدون تفاصيل
- كل توصية يجب أن تكون مخصصة ومحددة
- لا تكرر الجمل ولا تستخدم حشو`;

    let reportText = "";
    let qualityScore = 0;
    let retryCount = 0;
    let responseTime = 0;
    let usefulnessScore = 0;
    let evaluatorFeedback = "";
    let isRegenerated = false;

    try {
      // ---- First generation ----
      const aiResult = await callAIWithRetry(LOVABLE_API_KEY, {
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: inputContext },
        ],
      });

      reportText = aiResult.result.choices?.[0]?.message?.content || "تعذر إنشاء التقرير";
      retryCount = aiResult.retryCount;
      responseTime = aiResult.responseTime;
      qualityScore = calculateQualityScore(reportText);

      // ---- Evaluate with AI ----
      const evaluation = await evaluateOutput(LOVABLE_API_KEY, inputContext, reportText);
      usefulnessScore = evaluation.usefulness_score;
      evaluatorFeedback = evaluation.feedback;

      // ---- Regenerate if low quality ----
      if (usefulnessScore < 6) {
        console.warn(`Low usefulness (${usefulnessScore}/10) – regenerating report for ${booking_id}`);
        isRegenerated = true;

        const regenResult = await callAIWithRetry(LOVABLE_API_KEY, {
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `أنت محلل تعليمي محترف. التقرير السابق كان ضعيفاً بسبب: "${evaluatorFeedback}".

اكتب تقرير مفصل ومخصص جداً بناءً على البيانات التالية. يجب أن:
- يذكر مادة "${subjectName}" بشكل صريح ومتكرر
- يشمل أرقام وإحصائيات دقيقة من البيانات
- يتضمن توصيات محددة وقابلة للتنفيذ (ليست عامة)
- يحلل المحادثة ويستخرج نقاط قوة وضعف محددة

التقرير يجب أن يحتوي على: 📋 ملخص، 📊 إحصائيات، 🎯 تقييم، 💬 تفاعل، ⚠️ مخالفات، 📝 توصيات

درجة الأداء: ${performanceScore}/100`,
            },
            { role: "user", content: inputContext },
          ],
        });

        reportText = regenResult.result.choices?.[0]?.message?.content || reportText;
        retryCount += regenResult.retryCount + 1;
        responseTime += regenResult.responseTime;
        qualityScore = calculateQualityScore(reportText);

        // Re-evaluate
        const reEval = await evaluateOutput(LOVABLE_API_KEY, inputContext, reportText);
        usefulnessScore = reEval.usefulness_score;
        evaluatorFeedback = reEval.feedback;
      }

      // ---- Log ----
      await supabase.from("ai_logs").insert({
        feature_name: "session_report",
        input_summary: `مادة: ${subjectName}, مدة: ${durationMin}د, رسائل: ${totalMessages}`,
        output_summary: reportText.slice(0, 200),
        status: "success",
        response_time_ms: responseTime,
        quality_score: qualityScore,
        retry_count: retryCount,
        booking_id,
        user_id: booking.student_id,
        usefulness_score: usefulnessScore,
        is_regenerated: isRegenerated,
        evaluator_feedback: evaluatorFeedback.slice(0, 500),
      });

    } catch (aiError) {
      const errMsg = aiError instanceof Error ? aiError.message : "Unknown AI error";
      reportText = "تعذر إنشاء التقرير التلقائي. سيتم المراجعة يدوياً.";
      qualityScore = 0;
      usefulnessScore = 0;

      await supabase.from("ai_logs").insert({
        feature_name: "session_report",
        input_summary: `مادة: ${subjectName}, مدة: ${durationMin}د`,
        status: "failed",
        error_message: errMsg.slice(0, 500),
        retry_count: 3,
        booking_id,
        user_id: booking.student_id,
        usefulness_score: 0,
        is_regenerated: false,
      });

      // Notify admins
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (admins) {
        for (const admin of admins) {
          await supabase.from("notifications").insert({
            user_id: admin.user_id,
            title: "⚠️ فشل إنشاء تقرير AI",
            body: `فشل تقرير الحصة ${booking_id}: ${errMsg.slice(0, 100)}`,
            type: "ai_error",
          });
        }
      }
    }

    // ---- Check overall AI quality degradation ----
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentLogs } = await supabase
        .from("ai_logs")
        .select("usefulness_score")
        .eq("feature_name", "session_report")
        .gte("created_at", oneDayAgo)
        .not("usefulness_score", "is", null);

      if (recentLogs && recentLogs.length >= 5) {
        const weakCount = recentLogs.filter((l: any) => (l.usefulness_score || 0) < 6).length;
        const weakRatio = weakCount / recentLogs.length;
        if (weakRatio > 0.2) {
          const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
          if (admins) {
            for (const admin of admins) {
              await supabase.from("notifications").insert({
                user_id: admin.user_id,
                title: "🔴 تدهور جودة AI",
                body: `${Math.round(weakRatio * 100)}% من تقارير آخر 24 ساعة ضعيفة الجودة (${weakCount}/${recentLogs.length})`,
                type: "ai_quality_alert",
              });
            }
          }
        }
      }
    } catch (e) {
      console.error("Quality check error:", e);
    }

    // ---- Build report ----
    const structuredReport = {
      summary: reportText,
      performance_score: performanceScore,
      quality_score: qualityScore,
      usefulness_score: usefulnessScore,
      is_regenerated: isRegenerated,
      evaluator_feedback: evaluatorFeedback,
      duration_minutes: durationMin,
      total_messages: totalMessages,
      teacher_messages: teacherMessages,
      student_messages: studentMessages,
      violations_count: totalViolations,
      teacher_speaking_seconds: teacherSpeakingTime,
      student_speaking_seconds: studentSpeakingTime,
      retry_count: retryCount,
      generated_at: new Date().toISOString(),
    };

    if (session) {
      await supabase.from("sessions").update({ ai_report: JSON.stringify(structuredReport) }).eq("id", session.id);
    }

    // Points
    const { data: points } = await supabase.from("student_points").select("*").eq("user_id", booking.student_id).single();
    const pointsEarned = performanceScore >= 80 ? 50 : performanceScore >= 60 ? 30 : 15;
    if (points) {
      await supabase.from("student_points").update({
        total_points: (points.total_points || 0) + pointsEarned,
        last_activity_at: new Date().toISOString(),
      }).eq("user_id", booking.student_id);
    } else {
      await supabase.from("student_points").insert({ user_id: booking.student_id, total_points: pointsEarned, streak_days: 1 });
    }

    // Notifications
    await supabase.from("notifications").insert({
      user_id: booking.student_id, title: "تقرير الحصة جاهز 📝",
      body: `تقرير حصة ${subjectName} جاهز. درجة الأداء: ${performanceScore}/100. حصلت على ${pointsEarned} نقطة!`,
      type: "session_report",
    });
    await supabase.from("notifications").insert({
      user_id: booking.teacher_id, title: "تقرير حصة جديد 📊",
      body: `تقرير حصة ${subjectName} جاهز للمراجعة. درجة الأداء: ${performanceScore}/100`,
      type: "session_report",
    });

    return new Response(JSON.stringify({ report: structuredReport, points_earned: pointsEarned }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Session report error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
