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

// ---------- AI Evaluator ----------
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
            content: `أنت مقيّم جودة. قيّم التقرير. معايير:
1. الفائدة: هل يحتوي معلومات قابلة للتنفيذ؟
2. التخصيص: هل يذكر تفاصيل حقيقية من الجلسة (اقتباسات، أرقام)؟
3. عدم التعميم: هل يتجنب "يجب تحسين الأداء" بدون سياق؟
4. الارتباط بالبيانات: هل كل جملة مبنية على بيانات مدخلة؟
أجب باستخدام الأداة فقط.`,
          },
          {
            role: "user",
            content: `--- Input ---\n${inputContext.slice(0, 800)}\n\n--- Output ---\n${aiOutput.slice(0, 1500)}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "rate_output",
            description: "Rate quality",
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
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return { usefulness_score: Math.max(1, Math.min(10, parsed.usefulness_score || 5)), feedback: parsed.feedback || "" };
    }
    return { usefulness_score: 5, feedback: "تعذر تحليل الاستجابة" };
  } catch (e) {
    console.error("Evaluator error:", e);
    return { usefulness_score: 5, feedback: "خطأ في المقيّم" };
  }
}

// ---------- Extract questions from chat ----------
function extractQuestions(messages: { content: string; sender_id: string }[], studentId: string): string[] {
  const questionPattern = /[؟?]|كيف|ليش|لماذا|هل |ما هو|ما هي|وش |ايش|مش فاهم|ما فهمت|اشرح/;
  return messages
    .filter(m => m.sender_id === studentId && questionPattern.test(m.content))
    .map(m => m.content)
    .slice(0, 10);
}

// ---------- Extract sample exchanges ----------
function extractSampleExchanges(
  messages: { content: string; sender_id: string }[],
  teacherId: string,
  studentId: string,
): { student: string; teacher: string }[] {
  const exchanges: { student: string; teacher: string }[] = [];
  for (let i = 0; i < messages.length - 1 && exchanges.length < 3; i++) {
    if (messages[i].sender_id === studentId && messages[i + 1]?.sender_id === teacherId) {
      exchanges.push({
        student: messages[i].content.slice(0, 150),
        teacher: messages[i + 1].content.slice(0, 150),
      });
    }
  }
  return exchanges;
}

// ---------- Quality score (fast, no AI) ----------
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

// ---------- Check data sufficiency ----------
function assessDataSufficiency(
  totalMessages: number,
  teacherSpeaking: number,
  studentSpeaking: number,
  durationMin: number,
): { sufficient: boolean; level: "rich" | "moderate" | "minimal" | "none" } {
  const hasChat = totalMessages >= 3;
  const hasVoice = teacherSpeaking > 30 || studentSpeaking > 30;
  const hasTime = durationMin >= 5;

  if (hasChat && hasVoice && hasTime) return { sufficient: true, level: "rich" };
  if ((hasChat || hasVoice) && hasTime) return { sufficient: true, level: "moderate" };
  if (hasTime && totalMessages >= 1) return { sufficient: true, level: "minimal" };
  return { sufficient: false, level: "none" };
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

    // ---- Gather real data ----
    const { data: booking } = await supabase.from("bookings").select("*, subjects(name)").eq("id", booking_id).single();
    if (!booking) throw new Error("Booking not found");

    const { data: session } = await supabase.from("sessions").select("*").eq("booking_id", booking_id).single();

    const { data: allMessages } = await supabase
      .from("chat_messages")
      .select("content, sender_id, created_at, is_filtered")
      .eq("booking_id", booking_id)
      .order("created_at");

    const totalMessages = allMessages?.length || 0;
    const cleanMessages = allMessages?.filter(m => !m.is_filtered) || [];
    const teacherMessages = cleanMessages.filter(m => m.sender_id === booking.teacher_id);
    const studentMessages = cleanMessages.filter(m => m.sender_id === booking.student_id);
    const filteredMessages = allMessages?.filter(m => m.is_filtered).length || 0;

    const { count: violationsCount } = await supabase
      .from("violations").select("id", { count: "exact", head: true }).eq("booking_id", booking_id);

    const subjectName = booking.subjects?.name || "مادة عامة";
    const durationMin = session?.duration_minutes || session_stats?.duration_minutes || booking.duration_minutes || 45;
    const teacherSpeakingTime = session_stats?.teacher_speaking_seconds || 0;
    const studentSpeakingTime = session_stats?.student_speaking_seconds || 0;
    const questionsDetected = session_stats?.questions_detected || 0;
    const totalViolations = (violationsCount || 0) + (filteredMessages || 0);

    // ---- Extract real data artifacts ----
    const detectedQuestions = extractQuestions(cleanMessages, booking.student_id);
    const sampleExchanges = extractSampleExchanges(cleanMessages, booking.teacher_id, booking.student_id);
    const chatTranscript = cleanMessages.map(m => {
      const role = m.sender_id === booking.teacher_id ? "المعلم" : "الطالب";
      return `${role}: ${m.content}`;
    }).join("\n");

    // ---- Assess data sufficiency ----
    const sufficiency = assessDataSufficiency(totalMessages, teacherSpeakingTime, studentSpeakingTime, durationMin);

    // ---- Performance score ----
    let performanceScore = 80;
    if (totalViolations >= 5) performanceScore -= 40;
    else if (totalViolations >= 3) performanceScore -= 25;
    else if (totalViolations >= 1) performanceScore -= 10;
    if (totalMessages > 10) performanceScore += 10;
    if (totalMessages > 20) performanceScore += 5;
    if (durationMin >= 40) performanceScore += 5;
    if (durationMin >= 45) performanceScore += 5;
    // Voice interaction bonus
    if (teacherSpeakingTime > 120 && studentSpeakingTime > 60) performanceScore += 5;
    if (questionsDetected > 3) performanceScore += 5;
    performanceScore = Math.max(0, Math.min(100, performanceScore));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // ---- Build structured report ----
    const rawStats = {
      duration_minutes: durationMin,
      teacher_speaking_minutes: Math.round(teacherSpeakingTime / 60 * 10) / 10,
      student_speaking_minutes: Math.round(studentSpeakingTime / 60 * 10) / 10,
      silence_minutes: Math.max(0, Math.round((durationMin * 60 - teacherSpeakingTime - studentSpeakingTime) / 60 * 10) / 10),
      total_messages: totalMessages,
      teacher_messages_count: teacherMessages.length,
      student_messages_count: studentMessages.length,
      questions_detected: detectedQuestions.length || questionsDetected,
      violations_count: totalViolations,
    };

    // ---- If insufficient data, return limited report ----
    if (!sufficiency.sufficient) {
      const limitedReport = {
        summary: "لا توجد بيانات كافية لتحليل الجلسة بشكل مفصل. الجلسة كانت قصيرة جداً أو لم يتم تبادل أي تفاعل.",
        performance_score: performanceScore,
        quality_score: 0,
        usefulness_score: 0,
        is_regenerated: false,
        evaluator_feedback: "بيانات غير كافية",
        data_level: sufficiency.level,
        raw_stats: rawStats,
        sample_exchanges: [],
        detected_questions: [],
        generated_at: new Date().toISOString(),
      };

      if (session) {
        await supabase.from("sessions").update({ ai_report: JSON.stringify(limitedReport) }).eq("id", session.id);
      }

      await supabase.from("ai_logs").insert({
        feature_name: "session_report",
        input_summary: `مادة: ${subjectName}, مدة: ${durationMin}د, بيانات غير كافية`,
        output_summary: "تقرير محدود - بيانات غير كافية",
        status: "success",
        quality_score: 0,
        booking_id,
        user_id: booking.student_id,
        usefulness_score: 0,
      });

      return new Response(JSON.stringify({ report: limitedReport, points_earned: 5 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Build context from REAL data only ----
    const inputContext = `=== بيانات حقيقية من الجلسة ===
المادة: ${subjectName}
المدة: ${durationMin} دقيقة
وقت كلام المعلم: ${rawStats.teacher_speaking_minutes} دقيقة
وقت كلام الطالب: ${rawStats.student_speaking_minutes} دقيقة
وقت الصمت: ${rawStats.silence_minutes} دقيقة
الرسائل: ${totalMessages} (معلم: ${teacherMessages.length}، طالب: ${studentMessages.length})
الأسئلة المكتشفة: ${detectedQuestions.length || questionsDetected}
المخالفات: ${totalViolations}

=== أسئلة الطالب الحقيقية ===
${detectedQuestions.length > 0 ? detectedQuestions.map((q, i) => `${i + 1}. "${q}"`).join("\n") : "لم يتم اكتشاف أسئلة"}

=== نماذج من الحوار الحقيقي ===
${sampleExchanges.length > 0 ? sampleExchanges.map((e, i) => `حوار ${i + 1}:\n  الطالب: "${e.student}"\n  المعلم: "${e.teacher}"`).join("\n") : "لا توجد حوارات كافية"}

=== المحادثة الكاملة ===
${chatTranscript.slice(0, 2000) || "لم يتم تبادل رسائل"}`;

    const systemPrompt = `أنت محلل تعليمي. مهمتك إنشاء تقرير مبني حصرياً على البيانات الحقيقية المقدمة.

قواعد صارمة:
1. كل جملة يجب أن تكون مرتبطة ببيانات حقيقية من الجلسة
2. يجب اقتباس أسئلة وردود حقيقية من المحادثة
3. ممنوع استخدام عبارات عامة مثل "يجب تحسين الأداء" أو "ينصح بزيادة المشاركة" بدون ربطها بحدث حقيقي
4. لا تخترع أي معلومة غير موجودة في البيانات
5. إذا لم تتوفر بيانات عن نقطة معينة، اكتب "لا تتوفر بيانات"

هيكل التقرير:
📋 ملخص الحصة (مبني على المحادثة الفعلية فقط - اذكر المواضيع التي نوقشت فعلاً)
📊 تحليل التفاعل (أرقام حقيقية: وقت كلام كل طرف، عدد الرسائل، نسبة المشاركة)
💬 أمثلة من الجلسة (اقتبس سؤال حقيقي من الطالب ورد المعلم عليه)
🎯 تقييم الأداء (بناءً على نسبة كلام المعلم vs الطالب ونوعية الأسئلة)
⚠️ ملاحظات (مخالفات إن وجدت، فترات صمت طويلة)
📝 توصيات (مبنية على ما حدث فعلاً - مثال: "الطالب سأل عن X ولم يحصل على إجابة واضحة")

درجة الأداء: ${0}/100
مستوى البيانات: ${""}`; // will be filled below

    let reportText = "";
    let qualityScore = 0;
    let retryCount = 0;
    let responseTime = 0;
    let usefulnessScore = 0;
    let evaluatorFeedback = "";
    let isRegenerated = false;

    try {
      const filledPrompt = systemPrompt
        .replace(`${0}/100`, `${performanceScore}/100`)
        .replace(`${""}`, sufficiency.level);

      const aiResult = await callAIWithRetry(LOVABLE_API_KEY, {
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: filledPrompt },
          { role: "user", content: inputContext },
        ],
      });

      reportText = aiResult.result.choices?.[0]?.message?.content || "تعذر إنشاء التقرير";
      retryCount = aiResult.retryCount;
      responseTime = aiResult.responseTime;
      qualityScore = calculateQualityScore(reportText);

      // ---- Evaluate ----
      const evaluation = await evaluateOutput(LOVABLE_API_KEY, inputContext, reportText);
      usefulnessScore = evaluation.usefulness_score;
      evaluatorFeedback = evaluation.feedback;

      // ---- Regenerate if low quality ----
      if (usefulnessScore < 6) {
        isRegenerated = true;
        const regenResult = await callAIWithRetry(LOVABLE_API_KEY, {
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `التقرير السابق ضعيف: "${evaluatorFeedback}".

اكتب تقرير مبني حصرياً على البيانات التالية. لا تخترع أي شيء.
- اقتبس من المحادثة الحقيقية
- اذكر أرقام حقيقية فقط
- كل توصية يجب أن تشير لحدث محدد حصل في الجلسة
- المادة: ${subjectName}
- درجة الأداء: ${performanceScore}/100`,
            },
            { role: "user", content: inputContext },
          ],
        });

        reportText = regenResult.result.choices?.[0]?.message?.content || reportText;
        retryCount += regenResult.retryCount + 1;
        responseTime += regenResult.responseTime;
        qualityScore = calculateQualityScore(reportText);

        const reEval = await evaluateOutput(LOVABLE_API_KEY, inputContext, reportText);
        usefulnessScore = reEval.usefulness_score;
        evaluatorFeedback = reEval.feedback;
      }

      // ---- Log ----
      await supabase.from("ai_logs").insert({
        feature_name: "session_report",
        input_summary: `مادة: ${subjectName}, مدة: ${durationMin}د, رسائل: ${totalMessages}, بيانات: ${sufficiency.level}`,
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

    // ---- Quality degradation check ----
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
                body: `${Math.round(weakRatio * 100)}% من تقارير آخر 24 ساعة ضعيفة (${weakCount}/${recentLogs.length})`,
                type: "ai_quality_alert",
              });
            }
          }
        }
      }
    } catch (e) {
      console.error("Quality check error:", e);
    }

    // ---- Build structured report ----
    const structuredReport = {
      summary: reportText,
      performance_score: performanceScore,
      quality_score: qualityScore,
      usefulness_score: usefulnessScore,
      is_regenerated: isRegenerated,
      evaluator_feedback: evaluatorFeedback,
      data_level: sufficiency.level,
      raw_stats: rawStats,
      sample_exchanges: sampleExchanges,
      detected_questions: detectedQuestions.slice(0, 5),
      generated_at: new Date().toISOString(),
    };

    if (session) {
      await supabase.from("sessions").update({ ai_report: JSON.stringify(structuredReport) }).eq("id", session.id);
    }

    // Points
    const pointsEarned = performanceScore >= 80 ? 50 : performanceScore >= 60 ? 30 : 15;
    const { data: points } = await supabase.from("student_points").select("*").eq("user_id", booking.student_id).single();
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
      body: `تقرير حصة ${subjectName} جاهز. درجة الأداء: ${performanceScore}/100`,
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
