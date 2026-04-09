import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

async function evaluateOutput(apiKey: string, inputContext: string, aiOutput: string): Promise<{ usefulness_score: number; feedback: string }> {
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: `أنت مقيّم جودة. قيّم التقرير بناءً على: 1) هل يحتوي timeline زمني واضح؟ 2) هل كل جملة مرتبطة بدليل؟ 3) هل يتجنب العبارات العامة؟ 4) هل يكشف الفجوات التعليمية؟ أجب بالأداة فقط.` },
          { role: "user", content: `--- Input ---\n${inputContext.slice(0, 800)}\n\n--- Output ---\n${aiOutput.slice(0, 1500)}` },
        ],
        tools: [{ type: "function", function: { name: "rate_output", description: "Rate quality", parameters: { type: "object", properties: { usefulness_score: { type: "number", minimum: 1, maximum: 10 }, feedback: { type: "string" } }, required: ["usefulness_score", "feedback"], additionalProperties: false } } }],
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
    return { usefulness_score: 5, feedback: "تعذر تحليل" };
  } catch { return { usefulness_score: 5, feedback: "خطأ" }; }
}

// ─── Timeline Builder ───
interface TimelineEvent {
  type: "explanation" | "question" | "answer" | "confusion" | "silence" | "violation" | "greeting";
  time: string; // relative time like "00:02"
  timestamp: string; // ISO
  content: string;
  sender?: "teacher" | "student";
  duration_seconds?: number;
}

function buildTimeline(
  messages: { content: string; sender_id: string; created_at: string }[],
  teacherId: string,
  studentId: string,
  sessionStartedAt: string | null,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const startTime = sessionStartedAt ? new Date(sessionStartedAt).getTime() : (messages.length > 0 ? new Date(messages[0].created_at).getTime() : Date.now());

  const questionPattern = /[؟?]|كيف|ليش|لماذا|هل |ما هو|ما هي|وش |ايش/;
  const confusionPattern = /مش فاهم|ما فهمت|مو واضح|ماني فاهم|صعب|مش واضح|مافهمت|لا أفهم|ما أفهم/;
  const greetingPattern = /^(مرحبا|هلا|السلام|أهلا|هاي|مساء|صباح)/;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const msgTime = new Date(msg.created_at).getTime();
    const relativeMin = Math.floor((msgTime - startTime) / 60000);
    const relativeSec = Math.floor(((msgTime - startTime) % 60000) / 1000);
    const timeStr = `${String(relativeMin).padStart(2, "0")}:${String(relativeSec).padStart(2, "0")}`;
    const sender = msg.sender_id === teacherId ? "teacher" as const : "student" as const;

    // Check for silence gaps (> 60 seconds between messages)
    if (i > 0) {
      const prevTime = new Date(messages[i - 1].created_at).getTime();
      const gap = (msgTime - prevTime) / 1000;
      if (gap > 60) {
        const gapStart = Math.floor((prevTime - startTime) / 60000);
        events.push({
          type: "silence",
          time: `${String(gapStart).padStart(2, "0")}:00`,
          timestamp: messages[i - 1].created_at,
          content: `صمت لمدة ${Math.round(gap / 60)} دقيقة`,
          duration_seconds: Math.round(gap),
        });
      }
    }

    // Classify message
    let type: TimelineEvent["type"];
    if (greetingPattern.test(msg.content)) {
      type = "greeting";
    } else if (sender === "student" && confusionPattern.test(msg.content)) {
      type = "confusion";
    } else if (sender === "student" && questionPattern.test(msg.content)) {
      type = "question";
    } else if (sender === "teacher" && i > 0 && messages[i - 1].sender_id === studentId) {
      type = "answer";
    } else if (sender === "teacher") {
      type = "explanation";
    } else {
      type = "question"; // default student messages as engagement
    }

    events.push({
      type,
      time: timeStr,
      timestamp: msg.created_at,
      content: msg.content.slice(0, 200),
      sender,
    });
  }

  return events;
}

// ─── Gap Analysis ───
interface GapWarning {
  type: "no_interaction" | "unanswered_question" | "long_silence" | "confusion_ignored";
  description: string;
  time: string;
}

function analyzeGaps(timeline: TimelineEvent[]): GapWarning[] {
  const warnings: GapWarning[] = [];

  // Check for unanswered questions
  for (let i = 0; i < timeline.length; i++) {
    if (timeline[i].type === "question") {
      const nextTeacher = timeline.slice(i + 1, i + 4).find(e => e.sender === "teacher");
      if (!nextTeacher) {
        warnings.push({ type: "unanswered_question", description: `سؤال بدون إجابة: "${timeline[i].content.slice(0, 80)}"`, time: timeline[i].time });
      }
    }
    if (timeline[i].type === "confusion") {
      const nextTeacher = timeline.slice(i + 1, i + 4).find(e => e.sender === "teacher");
      if (!nextTeacher) {
        warnings.push({ type: "confusion_ignored", description: `عدم فهم لم يُعالج: "${timeline[i].content.slice(0, 80)}"`, time: timeline[i].time });
      }
    }
    if (timeline[i].type === "silence" && (timeline[i].duration_seconds || 0) > 120) {
      warnings.push({ type: "long_silence", description: timeline[i].content, time: timeline[i].time });
    }
  }

  // Check for explanation without any student response
  const explanations = timeline.filter(e => e.type === "explanation");
  const studentEvents = timeline.filter(e => e.sender === "student");
  if (explanations.length > 5 && studentEvents.length < 2) {
    warnings.push({ type: "no_interaction", description: `${explanations.length} شرح بدون تفاعل من الطالب`, time: "" });
  }

  return warnings;
}

// ─── Topic Extraction ───
function extractTopicsFromTimeline(timeline: TimelineEvent[]): string[] {
  const explanations = timeline.filter(e => e.type === "explanation" || e.type === "answer");
  // Simple keyword extraction from teacher messages
  const words: Record<string, number> = {};
  explanations.forEach(e => {
    const tokens = e.content.split(/\s+/).filter(w => w.length > 3);
    tokens.forEach(w => { words[w] = (words[w] || 0) + 1; });
  });
  return Object.entries(words)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

// ─── Statistics from Timeline ───
function computeTimelineStats(timeline: TimelineEvent[]) {
  return {
    explanations_count: timeline.filter(e => e.type === "explanation").length,
    questions_count: timeline.filter(e => e.type === "question").length,
    answers_count: timeline.filter(e => e.type === "answer").length,
    confusion_count: timeline.filter(e => e.type === "confusion").length,
    silence_events: timeline.filter(e => e.type === "silence").length,
    total_silence_seconds: timeline.filter(e => e.type === "silence").reduce((sum, e) => sum + (e.duration_seconds || 0), 0),
  };
}

function calculateQualityScore(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  let score = 0;
  const len = text.length;
  if (len >= 200 && len <= 3000) score += 30; else if (len >= 100) score += 15; else score += 5;
  if (text.includes("📋") || text.includes("📊") || text.includes("🎯")) score += 20;
  const sentences = text.split(/[.。\n]/).filter(s => s.trim().length > 10);
  const unique = new Set(sentences.map(s => s.trim()));
  score += Math.round((sentences.length > 0 ? unique.size / sentences.length : 1) * 20);
  if (/[\u0600-\u06FF]/.test(text)) score += 15;
  if (!text.includes("تعذر") && !text.includes("خطأ")) score += 15;
  return Math.min(100, score);
}

function assessDataSufficiency(totalMessages: number, teacherSpeaking: number, studentSpeaking: number, durationMin: number) {
  const hasChat = totalMessages >= 3;
  const hasVoice = teacherSpeaking > 30 || studentSpeaking > 30;
  const hasTime = durationMin >= 5;
  if (hasChat && hasVoice && hasTime) return { sufficient: true, level: "rich" as const };
  if ((hasChat || hasVoice) && hasTime) return { sufficient: true, level: "moderate" as const };
  if (hasTime && totalMessages >= 1) return { sufficient: true, level: "minimal" as const };
  return { sufficient: false, level: "none" as const };
}

// ─── Main ───
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { booking_id, session_stats } = await req.json();
    if (!booking_id) throw new Error("booking_id is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

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
    const filteredMessages = allMessages?.filter(m => m.is_filtered).length || 0;

    const { count: violationsCount } = await supabase
      .from("violations").select("id", { count: "exact", head: true }).eq("booking_id", booking_id);

    const subjectName = booking.subjects?.name || "مادة عامة";
    const durationMin = session?.duration_minutes || session_stats?.duration_minutes || booking.duration_minutes || 45;
    const teacherSpeakingTime = session_stats?.teacher_speaking_seconds || 0;
    const studentSpeakingTime = session_stats?.student_speaking_seconds || 0;
    const questionsDetected = session_stats?.questions_detected || 0;
    const totalViolations = (violationsCount || 0) + (filteredMessages || 0);

    // ─── Build Timeline ───
    const timeline = buildTimeline(cleanMessages, booking.teacher_id, booking.student_id, session?.started_at || null);
    const timelineStats = computeTimelineStats(timeline);
    const gapWarnings = analyzeGaps(timeline);
    const extractedTopics = extractTopicsFromTimeline(timeline);

    const sufficiency = assessDataSufficiency(totalMessages, teacherSpeakingTime, studentSpeakingTime, durationMin);

    // ─── Performance Score ───
    let performanceScore = 80;
    if (totalViolations >= 5) performanceScore -= 40;
    else if (totalViolations >= 3) performanceScore -= 25;
    else if (totalViolations >= 1) performanceScore -= 10;
    if (totalMessages > 10) performanceScore += 10;
    if (totalMessages > 20) performanceScore += 5;
    if (durationMin >= 40) performanceScore += 5;
    if (durationMin >= 45) performanceScore += 5;
    if (teacherSpeakingTime > 120 && studentSpeakingTime > 60) performanceScore += 5;
    if (timelineStats.questions_count > 3) performanceScore += 5;
    // Deduct for gaps
    if (gapWarnings.filter(g => g.type === "unanswered_question").length > 0) performanceScore -= 5;
    if (gapWarnings.filter(g => g.type === "confusion_ignored").length > 0) performanceScore -= 10;
    performanceScore = Math.max(0, Math.min(100, performanceScore));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const rawStats = {
      duration_minutes: durationMin,
      teacher_speaking_minutes: Math.round(teacherSpeakingTime / 60 * 10) / 10,
      student_speaking_minutes: Math.round(studentSpeakingTime / 60 * 10) / 10,
      silence_minutes: Math.max(0, Math.round((durationMin * 60 - teacherSpeakingTime - studentSpeakingTime) / 60 * 10) / 10),
      total_messages: totalMessages,
      teacher_messages_count: cleanMessages.filter(m => m.sender_id === booking.teacher_id).length,
      student_messages_count: cleanMessages.filter(m => m.sender_id === booking.student_id).length,
      questions_detected: timelineStats.questions_count || questionsDetected,
      violations_count: totalViolations,
      explanations_count: timelineStats.explanations_count,
      answers_count: timelineStats.answers_count,
      confusion_count: timelineStats.confusion_count,
      silence_events: timelineStats.silence_events,
      total_silence_seconds: timelineStats.total_silence_seconds,
    };

    // ─── Insufficient data ───
    if (!sufficiency.sufficient) {
      const limitedReport = {
        summary: "لا توجد بيانات كافية لتحليل الجلسة بشكل مفصل.",
        performance_score: performanceScore,
        quality_score: 0, usefulness_score: 0, is_regenerated: false,
        data_level: sufficiency.level,
        raw_stats: rawStats,
        timeline: timeline.slice(0, 20),
        timeline_stats: timelineStats,
        gap_warnings: [],
        extracted_topics: [],
        sample_exchanges: [],
        detected_questions: [],
        generated_at: new Date().toISOString(),
      };
      if (session) await supabase.from("sessions").update({ ai_report: JSON.stringify(limitedReport) }).eq("id", session.id);
      await supabase.from("ai_logs").insert({ feature_name: "session_report", input_summary: `مادة: ${subjectName}, بيانات غير كافية`, output_summary: "تقرير محدود", status: "success", quality_score: 0, booking_id, user_id: booking.student_id, usefulness_score: 0 });
      return new Response(JSON.stringify({ report: limitedReport, points_earned: 5 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── Build Timeline-based context for AI ───
    const timelineText = timeline.slice(0, 50).map(e => {
      const icon = e.type === "explanation" ? "📖" : e.type === "question" ? "❓" : e.type === "answer" ? "💡" : e.type === "confusion" ? "😕" : e.type === "silence" ? "🔇" : e.type === "violation" ? "⚠️" : "👋";
      return `[${e.time}] ${icon} ${e.sender === "teacher" ? "المعلم" : e.sender === "student" ? "الطالب" : ""}: ${e.content}`;
    }).join("\n");

    const gapText = gapWarnings.length > 0
      ? gapWarnings.map(g => `- [${g.time}] ${g.description}`).join("\n")
      : "لا توجد فجوات";

    const inputContext = `=== Timeline الجلسة (أحداث مرتبة زمنياً) ===
${timelineText}

=== إحصائيات الأحداث ===
شروحات: ${timelineStats.explanations_count}
أسئلة: ${timelineStats.questions_count}
إجابات: ${timelineStats.answers_count}
لحظات عدم فهم: ${timelineStats.confusion_count}
فترات صمت: ${timelineStats.silence_events} (إجمالي ${Math.round(timelineStats.total_silence_seconds / 60)} دقيقة)

=== فجوات تعليمية مكتشفة ===
${gapText}

=== مواضيع مستخرجة ===
${extractedTopics.length > 0 ? extractedTopics.join("، ") : "لم يتم اكتشاف مواضيع"}

=== بيانات الجلسة ===
المادة: ${subjectName}
المدة: ${durationMin} دقيقة
كلام المعلم: ${rawStats.teacher_speaking_minutes} دقيقة
كلام الطالب: ${rawStats.student_speaking_minutes} دقيقة
المخالفات: ${totalViolations}`;

    const systemPrompt = `أنت محلل تعليمي متخصص في تحليل الجلسات عبر Timeline.

مهمتك: إنشاء تقرير زمني تسلسلي يتبع مسار الجلسة خطوة بخطوة.

هيكل التقرير الإلزامي:

📋 مسار الجلسة (Timeline Summary):
- "بدأت الجلسة بـ..." (اقتبس من أول حدث)
- "ثم قام المعلم بـ..." (اذكر الشروحات الفعلية)
- "بعد ذلك سأل الطالب..." (اقتبس السؤال الحقيقي)
- "تمت الإجابة بـ..." (اقتبس الرد)
كل جملة يجب أن تحتوي على الوقت [MM:SS] أو اقتباس حقيقي.

📊 تحليل التفاعل:
- عدد الشروحات vs الأسئلة vs الإجابات
- نسبة المشاركة الفعلية
- فترات الصمت وتأثيرها

🔍 المواضيع التي تم شرحها:
- حدد المواضيع الفعلية من المحادثة
- هل الشرح كان عميقاً أم سطحياً؟

⚠️ الفجوات التعليمية:
- أسئلة بدون إجابة
- لحظات عدم فهم لم تُعالج
- شرح بدون تفاعل

🎯 تقييم الأداء: ${performanceScore}/100

📝 توصيات مبنية على أحداث حقيقية فقط

قواعد صارمة:
1. كل جملة يجب أن تحتوي على [timestamp] أو "اقتباس"
2. ممنوع أي عبارة عامة بدون دليل من الأحداث
3. لا تخترع أي معلومة
4. إذا لم توجد بيانات، اكتب "لا تتوفر بيانات"`;

    let reportText = "";
    let qualityScore = 0;
    let retryCount = 0;
    let responseTime = 0;
    let usefulnessScore = 0;
    let evaluatorFeedback = "";
    let isRegenerated = false;

    try {
      const aiResult = await callAIWithRetry(LOVABLE_API_KEY, {
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: inputContext }],
      });

      reportText = aiResult.result.choices?.[0]?.message?.content || "تعذر إنشاء التقرير";
      retryCount = aiResult.retryCount;
      responseTime = aiResult.responseTime;
      qualityScore = calculateQualityScore(reportText);

      const evaluation = await evaluateOutput(LOVABLE_API_KEY, inputContext, reportText);
      usefulnessScore = evaluation.usefulness_score;
      evaluatorFeedback = evaluation.feedback;

      if (usefulnessScore < 6) {
        isRegenerated = true;
        const regenResult = await callAIWithRetry(LOVABLE_API_KEY, {
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: `التقرير السابق ضعيف: "${evaluatorFeedback}". أعد كتابة التقرير بشكل تسلسلي زمني. كل جملة يجب أن تحتوي على [وقت] أو اقتباس. اعتمد حصرياً على Timeline المقدم. المادة: ${subjectName}. درجة الأداء: ${performanceScore}/100` },
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

      await supabase.from("ai_logs").insert({
        feature_name: "session_report",
        input_summary: `مادة: ${subjectName}, مدة: ${durationMin}د, أحداث: ${timeline.length}, بيانات: ${sufficiency.level}`,
        output_summary: reportText.slice(0, 200),
        status: "success", response_time_ms: responseTime, quality_score: qualityScore,
        retry_count: retryCount, booking_id, user_id: booking.student_id,
        usefulness_score: usefulnessScore, is_regenerated: isRegenerated,
        evaluator_feedback: evaluatorFeedback.slice(0, 500),
      });
    } catch (aiError) {
      const errMsg = aiError instanceof Error ? aiError.message : "Unknown AI error";
      reportText = "تعذر إنشاء التقرير التلقائي.";
      qualityScore = 0; usefulnessScore = 0;
      await supabase.from("ai_logs").insert({ feature_name: "session_report", input_summary: `مادة: ${subjectName}`, status: "failed", error_message: errMsg.slice(0, 500), retry_count: 3, booking_id, user_id: booking.student_id, usefulness_score: 0, is_regenerated: false });
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (admins) { for (const admin of admins) { await supabase.from("notifications").insert({ user_id: admin.user_id, title: "⚠️ فشل تقرير AI", body: `فشل: ${errMsg.slice(0, 100)}`, type: "ai_error" }); } }
    }

    // Quality degradation check - only alert once per 6 hours
    try {
      const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
      const sixHoursAgo = new Date(Date.now() - 6 * 3600000).toISOString();
      const { data: recentLogs } = await supabase.from("ai_logs").select("usefulness_score").eq("feature_name", "session_report").gte("created_at", oneDayAgo).not("usefulness_score", "is", null);
      if (recentLogs && recentLogs.length >= 5) {
        const weakCount = recentLogs.filter((l: any) => (l.usefulness_score || 0) < 6).length;
        if (weakCount / recentLogs.length > 0.2) {
          // Check if we already sent this alert recently (within 6 hours)
          const { count: recentAlerts } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("type", "ai_quality_alert").gte("created_at", sixHoursAgo);
          if (!recentAlerts || recentAlerts === 0) {
            const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
            if (admins) { for (const a of admins) { await supabase.from("notifications").insert({ user_id: a.user_id, title: "🔴 تدهور جودة AI", body: `${Math.round(weakCount / recentLogs.length * 100)}% ضعيفة`, type: "ai_quality_alert" }); } }
          }
        }
      }
    } catch {}

    // ─── Build final report ───
    const sampleExchanges: { student: string; teacher: string }[] = [];
    for (let i = 0; i < timeline.length - 1 && sampleExchanges.length < 3; i++) {
      if (timeline[i].sender === "student" && timeline[i + 1]?.sender === "teacher") {
        sampleExchanges.push({ student: timeline[i].content.slice(0, 150), teacher: timeline[i + 1].content.slice(0, 150) });
      }
    }

    const structuredReport = {
      summary: reportText,
      performance_score: performanceScore,
      quality_score: qualityScore,
      usefulness_score: usefulnessScore,
      is_regenerated: isRegenerated,
      evaluator_feedback: evaluatorFeedback,
      data_level: sufficiency.level,
      raw_stats: rawStats,
      timeline: timeline.slice(0, 30),
      timeline_stats: timelineStats,
      gap_warnings: gapWarnings,
      extracted_topics: extractedTopics,
      sample_exchanges: sampleExchanges,
      detected_questions: timeline.filter(e => e.type === "question").map(e => e.content).slice(0, 5),
      generated_at: new Date().toISOString(),
    };

    if (session) await supabase.from("sessions").update({ ai_report: JSON.stringify(structuredReport) }).eq("id", session.id);

    const pointsEarned = performanceScore >= 80 ? 50 : performanceScore >= 60 ? 30 : 15;
    const { data: points } = await supabase.from("student_points").select("*").eq("user_id", booking.student_id).single();
    if (points) { await supabase.from("student_points").update({ total_points: (points.total_points || 0) + pointsEarned, last_activity_at: new Date().toISOString() }).eq("user_id", booking.student_id); }
    else { await supabase.from("student_points").insert({ user_id: booking.student_id, total_points: pointsEarned, streak_days: 1 }); }

    await supabase.from("notifications").insert({ user_id: booking.student_id, title: "تقرير الحصة جاهز 📝", body: `تقرير حصة ${subjectName} جاهز. درجة الأداء: ${performanceScore}/100. حصلت على ${pointsEarned} نقطة!`, type: "session_report" });
    await supabase.from("notifications").insert({ user_id: booking.teacher_id, title: "تقرير حصة جديد 📊", body: `تقرير حصة ${subjectName} جاهز. درجة الأداء: ${performanceScore}/100`, type: "session_report" });

    return new Response(JSON.stringify({ report: structuredReport, points_earned: pointsEarned }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Session report error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
