import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Get violations count
    const { count: violationsCount } = await supabase
      .from("violations")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", booking_id);

    // Get warnings count
    const { count: warningsCount } = await supabase
      .from("user_warnings")
      .select("id", { count: "exact", head: true })
      .in("user_id", [booking.student_id, booking.teacher_id]);

    const chatSummary = allMessages?.filter(m => !m.is_filtered).map(m => m.content).join("\n") || "لم يتم تبادل رسائل";
    const subjectName = booking.subjects?.name || "مادة عامة";
    const durationMin = session?.duration_minutes || booking.duration_minutes || 45;

    // Stats from client (speaking time etc)
    const teacherSpeakingTime = session_stats?.teacher_speaking_seconds || 0;
    const studentSpeakingTime = session_stats?.student_speaking_seconds || 0;
    const totalViolations = (violationsCount || 0) + (filteredMessages || 0);

    // Calculate performance score
    let performanceScore = 80; // base score
    // Violations penalty
    if (totalViolations >= 5) performanceScore -= 40;
    else if (totalViolations >= 3) performanceScore -= 25;
    else if (totalViolations >= 1) performanceScore -= 10;
    // Interaction bonus
    if (totalMessages > 10) performanceScore += 10;
    if (totalMessages > 20) performanceScore += 5;
    // Duration bonus
    if (durationMin >= 40) performanceScore += 5;
    if (durationMin >= 45) performanceScore += 5;
    // Clamp
    performanceScore = Math.max(0, Math.min(100, performanceScore));

    // Generate AI report
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `أنت محلل تعليمي محترف. قم بإنشاء تقرير شامل عن حصة تعليمية بناءً على البيانات التالية.

التقرير يجب أن يحتوي على الأقسام التالية بالترتيب:

📋 ملخص الحصة
- ملخص مختصر في 3-4 جمل

📊 إحصائيات الحصة
- مدة الحصة: ${durationMin} دقيقة
- عدد الرسائل الكلي: ${totalMessages} (معلم: ${teacherMessages}، طالب: ${studentMessages})
- عدد المخالفات: ${totalViolations}
${teacherSpeakingTime > 0 ? `- وقت تحدث المعلم: ${Math.floor(teacherSpeakingTime / 60)} دقيقة` : ""}
${studentSpeakingTime > 0 ? `- وقت تحدث الطالب: ${Math.floor(studentSpeakingTime / 60)} دقيقة` : ""}

🎯 تقييم أداء المعلم
- قيّم أداء المعلم بناءً على التفاعل ومدة الحصة

💬 ملاحظات على التفاعل
- حلل مستوى التفاعل بين الطالب والمعلم

⚠️ المخالفات والملاحظات السلوكية
- اذكر عدد المخالفات وتأثيرها

📝 توصيات
- توصيات للتحسين

درجة الأداء المحسوبة: ${performanceScore}/100

اكتب التقرير بالعربية بأسلوب مهني. لا تستخدم أرقام الأقسام.`,
          },
          {
            role: "user",
            content: `المادة: ${subjectName}\nمدة الحصة الفعلية: ${durationMin} دقيقة\nعدد الرسائل: ${totalMessages}\nعدد المخالفات: ${totalViolations}\n\nملخص المحادثة:\n${chatSummary.slice(0, 2000)}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      throw new Error("AI generation failed");
    }
    const aiData = await aiResponse.json();
    const reportText = aiData.choices?.[0]?.message?.content || "تعذر إنشاء التقرير";

    // Build structured report JSON
    const structuredReport = {
      summary: reportText,
      performance_score: performanceScore,
      duration_minutes: durationMin,
      total_messages: totalMessages,
      teacher_messages: teacherMessages,
      student_messages: studentMessages,
      violations_count: totalViolations,
      teacher_speaking_seconds: teacherSpeakingTime,
      student_speaking_seconds: studentSpeakingTime,
      generated_at: new Date().toISOString(),
    };

    // Save report to session
    if (session) {
      await supabase
        .from("sessions")
        .update({ ai_report: JSON.stringify(structuredReport) })
        .eq("id", session.id);
    }

    // Add points for completing session
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

    // Notify student
    await supabase.from("notifications").insert({
      user_id: booking.student_id,
      title: "تقرير الحصة جاهز 📝",
      body: `تقرير حصة ${subjectName} جاهز. درجة الأداء: ${performanceScore}/100. حصلت على ${pointsEarned} نقطة!`,
      type: "session_report",
    });

    // Notify teacher
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
