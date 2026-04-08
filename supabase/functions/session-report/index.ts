import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Quality scoring for AI output
function calculateQualityScore(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  let score = 0;
  const len = text.length;
  // Length check (200-3000 chars is ideal)
  if (len >= 200 && len <= 3000) score += 30;
  else if (len >= 100) score += 15;
  else score += 5;
  // Has structure (sections/bullets)
  if (text.includes("📋") || text.includes("📊") || text.includes("🎯")) score += 20;
  // No repetition (check duplicate sentences)
  const sentences = text.split(/[.。\n]/).filter(s => s.trim().length > 10);
  const unique = new Set(sentences.map(s => s.trim()));
  const repetitionRatio = sentences.length > 0 ? unique.size / sentences.length : 1;
  score += Math.round(repetitionRatio * 20);
  // Has Arabic content
  if (/[\u0600-\u06FF]/.test(text)) score += 15;
  // Not an error message
  if (!text.includes("تعذر") && !text.includes("خطأ")) score += 15;
  return Math.min(100, score);
}

// Retry wrapper for AI calls
async function callAIWithRetry(
  apiKey: string,
  body: any,
  maxRetries = 3
): Promise<{ result: any; retryCount: number; responseTime: number }> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const start = Date.now();
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const responseTime = Date.now() - start;
      if (!resp.ok) {
        const errText = await resp.text();
        lastError = new Error(`AI error ${resp.status}: ${errText}`);
        console.error(`Attempt ${attempt + 1} failed:`, lastError.message);
        if (resp.status === 429 || resp.status === 402) {
          // Don't retry rate limits or payment issues
          throw lastError;
        }
        continue;
      }
      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || "";
      // Quality check - retry if output is too short or empty
      if (content.length < 50 && attempt < maxRetries - 1) {
        console.warn(`Attempt ${attempt + 1}: Output too short (${content.length} chars), retrying...`);
        continue;
      }
      return { result: data, retryCount: attempt, responseTime };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (e instanceof Error && (e.message.includes("429") || e.message.includes("402"))) throw e;
    }
  }
  throw lastError || new Error("Max retries exceeded");
}

// Log AI operation
async function logAIOperation(
  supabase: any,
  params: {
    feature_name: string;
    input_summary?: string;
    output_summary?: string;
    status: string;
    response_time_ms?: number;
    quality_score?: number;
    retry_count?: number;
    error_message?: string;
    booking_id?: string;
    user_id?: string;
  }
) {
  try {
    await supabase.from("ai_logs").insert({
      feature_name: params.feature_name,
      input_summary: params.input_summary?.slice(0, 500),
      output_summary: params.output_summary?.slice(0, 500),
      status: params.status,
      response_time_ms: params.response_time_ms,
      quality_score: params.quality_score || 0,
      retry_count: params.retry_count || 0,
      error_message: params.error_message?.slice(0, 500),
      booking_id: params.booking_id,
      user_id: params.user_id,
    });
  } catch (e) {
    console.error("Failed to log AI operation:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { booking_id, session_stats } = await req.json();
    if (!booking_id) throw new Error("booking_id is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get booking details
    const { data: booking } = await supabase
      .from("bookings")
      .select("*, subjects(name)")
      .eq("id", booking_id)
      .single();
    if (!booking) throw new Error("Booking not found");

    // Get session info
    const { data: session } = await supabase
      .from("sessions")
      .select("*")
      .eq("booking_id", booking_id)
      .single();

    // Get chat messages count
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
      .from("violations")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", booking_id);

    const chatSummary = allMessages?.filter(m => !m.is_filtered).map(m => m.content).join("\n") || "لم يتم تبادل رسائل";
    const subjectName = booking.subjects?.name || "مادة عامة";
    const durationMin = session?.duration_minutes || booking.duration_minutes || 45;

    const teacherSpeakingTime = session_stats?.teacher_speaking_seconds || 0;
    const studentSpeakingTime = session_stats?.student_speaking_seconds || 0;
    const totalViolations = (violationsCount || 0) + (filteredMessages || 0);

    // Calculate performance score
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

    const inputSummary = `مادة: ${subjectName}, مدة: ${durationMin}د, رسائل: ${totalMessages}, مخالفات: ${totalViolations}`;

    let reportText = "";
    let qualityScore = 0;
    let retryCount = 0;
    let responseTime = 0;

    try {
      const aiResult = await callAIWithRetry(LOVABLE_API_KEY, {
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `أنت محلل تعليمي محترف. أنشئ تقريراً منظماً وواضحاً عن حصة تعليمية من 3 إلى 5 نقاط رئيسية.

التقرير يجب أن يحتوي على:
📋 ملخص الحصة (3-4 جمل واضحة)
📊 إحصائيات الحصة (مدة: ${durationMin}د، رسائل: ${totalMessages}، مخالفات: ${totalViolations})
🎯 تقييم أداء المعلم
💬 ملاحظات على التفاعل
⚠️ المخالفات السلوكية
📝 توصيات للتحسين

درجة الأداء: ${performanceScore}/100
${teacherSpeakingTime > 0 ? `وقت تحدث المعلم: ${Math.floor(teacherSpeakingTime / 60)} دقيقة` : ""}
${studentSpeakingTime > 0 ? `وقت تحدث الطالب: ${Math.floor(studentSpeakingTime / 60)} دقيقة` : ""}

قواعد مهمة:
- لا تكرر الجمل
- لا تستخدم حشو
- اكتب بالعربية بأسلوب مهني مختصر
- لا تستخدم أرقام الأقسام`,
          },
          {
            role: "user",
            content: `المادة: ${subjectName}\nمدة الحصة: ${durationMin} دقيقة\nعدد الرسائل: ${totalMessages}\nمخالفات: ${totalViolations}\n\nالمحادثة:\n${chatSummary.slice(0, 2000)}`,
          },
        ],
      });

      reportText = aiResult.result.choices?.[0]?.message?.content || "تعذر إنشاء التقرير";
      retryCount = aiResult.retryCount;
      responseTime = aiResult.responseTime;
      qualityScore = calculateQualityScore(reportText);

      // If quality is too low, log warning
      if (qualityScore < 40) {
        console.warn(`Low quality report (${qualityScore}) for booking ${booking_id}`);
      }

      await logAIOperation(supabase, {
        feature_name: "session_report",
        input_summary: inputSummary,
        output_summary: reportText.slice(0, 200),
        status: "success",
        response_time_ms: responseTime,
        quality_score: qualityScore,
        retry_count: retryCount,
        booking_id,
        user_id: booking.student_id,
      });
    } catch (aiError) {
      const errMsg = aiError instanceof Error ? aiError.message : "Unknown AI error";
      reportText = "تعذر إنشاء التقرير التلقائي. سيتم المراجعة يدوياً.";
      qualityScore = 0;

      await logAIOperation(supabase, {
        feature_name: "session_report",
        input_summary: inputSummary,
        status: "failed",
        error_message: errMsg,
        retry_count: 3,
        booking_id,
        user_id: booking.student_id,
      });

      // Notify admins about failure
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (admins) {
        for (const admin of admins) {
          await supabase.from("notifications").insert({
            user_id: admin.user_id,
            title: "⚠️ فشل إنشاء تقرير AI",
            body: `فشل إنشاء تقرير الحصة ${booking_id} بعد 3 محاولات: ${errMsg.slice(0, 100)}`,
            type: "ai_error",
          });
        }
      }
    }

    const structuredReport = {
      summary: reportText,
      performance_score: performanceScore,
      quality_score: qualityScore,
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
      await supabase
        .from("sessions")
        .update({ ai_report: JSON.stringify(structuredReport) })
        .eq("id", session.id);
    }

    // Points
    const { data: points } = await supabase
      .from("student_points")
      .select("*")
      .eq("user_id", booking.student_id)
      .single();

    const pointsEarned = performanceScore >= 80 ? 50 : performanceScore >= 60 ? 30 : 15;

    if (points) {
      await supabase
        .from("student_points")
        .update({
          total_points: (points.total_points || 0) + pointsEarned,
          last_activity_at: new Date().toISOString(),
        })
        .eq("user_id", booking.student_id);
    } else {
      await supabase.from("student_points").insert({
        user_id: booking.student_id,
        total_points: pointsEarned,
        streak_days: 1,
      });
    }

    await supabase.from("notifications").insert({
      user_id: booking.student_id,
      title: "تقرير الحصة جاهز 📝",
      body: `تقرير حصة ${subjectName} جاهز. درجة الأداء: ${performanceScore}/100. حصلت على ${pointsEarned} نقطة!`,
      type: "session_report",
    });

    await supabase.from("notifications").insert({
      user_id: booking.teacher_id,
      title: "تقرير حصة جديد 📊",
      body: `تقرير حصة ${subjectName} جاهز للمراجعة. درجة الأداء: ${performanceScore}/100`,
      type: "session_report",
    });

    return new Response(JSON.stringify({ report: structuredReport, points_earned: pointsEarned }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Session report error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
