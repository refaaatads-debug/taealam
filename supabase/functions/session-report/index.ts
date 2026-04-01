import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { booking_id } = await req.json();
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

    // Get chat messages for this session
    const { data: messages } = await supabase
      .from("chat_messages")
      .select("content, sender_id, created_at")
      .eq("booking_id", booking_id)
      .eq("is_filtered", false)
      .order("created_at");

    // Get session info
    const { data: session } = await supabase
      .from("sessions")
      .select("*")
      .eq("booking_id", booking_id)
      .single();

    const chatSummary = messages?.map((m) => m.content).join("\n") || "لم يتم تبادل رسائل";
    const subjectName = booking.subjects?.name || "مادة عامة";
    const durationMin = session?.duration_minutes || booking.duration_minutes || 60;

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
            content: `أنت مساعد تعليمي. قم بإنشاء تقرير مختصر عن حصة تعليمية. التقرير يجب أن يحتوي على:
1. ملخص الحصة (2-3 جمل)
2. النقاط الرئيسية التي تمت تغطيتها
3. نقاط القوة للطالب
4. نقاط التحسين المقترحة
5. توصيات للحصة القادمة

اكتب التقرير بالعربية بأسلوب مهني ومشجع.`,
          },
          {
            role: "user",
            content: `المادة: ${subjectName}\nمدة الحصة: ${durationMin} دقيقة\n\nملخص المحادثة:\n${chatSummary}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) throw new Error("AI generation failed");
    const aiData = await aiResponse.json();
    const report = aiData.choices?.[0]?.message?.content || "تعذر إنشاء التقرير";

    // Save report to session
    if (session) {
      await supabase
        .from("sessions")
        .update({ ai_report: report })
        .eq("id", session.id);
    }

    // Add points for completing session
    const { data: points } = await supabase
      .from("student_points")
      .select("*")
      .eq("user_id", booking.student_id)
      .single();

    if (points) {
      await supabase
        .from("student_points")
        .update({
          total_points: (points.total_points || 0) + 50,
          last_activity_at: new Date().toISOString(),
        })
        .eq("user_id", booking.student_id);
    } else {
      await supabase.from("student_points").insert({
        user_id: booking.student_id,
        total_points: 50,
        streak_days: 1,
      });
    }

    // Create notification for student
    await supabase.from("notifications").insert({
      user_id: booking.student_id,
      title: "تقرير الحصة جاهز 📝",
      body: `تقرير حصة ${subjectName} جاهز للمراجعة. حصلت على 50 نقطة!`,
      type: "session_report",
    });

    return new Response(JSON.stringify({ report, points_earned: 50 }), {
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
