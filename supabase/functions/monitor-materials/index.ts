import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // 1. Find completed sessions with duration >= 5 min that have no material
    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, booking_id, duration_minutes, recording_url, ended_at")
      .not("ended_at", "is", null)
      .gte("ended_at", sevenDaysAgo.toISOString())
      .gte("duration_minutes", 5);

    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({ missing: 0, repaired: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sessionIds = sessions.map(s => s.id);
    const { data: existingMats } = await supabase
      .from("session_materials")
      .select("id, session_id, recording_url")
      .in("session_id", sessionIds);

    const existingMap = new Map((existingMats ?? []).map(m => [m.session_id, m]));
    const missingSessions = sessions.filter(s => !existingMap.has(s.id));
    const missingRecordingLinks = sessions.filter((s) => {
      const material = existingMap.get(s.id);
      return Boolean(material && s.recording_url && !material.recording_url);
    });

    let repaired = 0;
    let repairedLinks = 0;
    let failed = 0;

    for (const session of missingSessions) {
      // Get booking details
      const { data: booking } = await supabase
        .from("bookings")
        .select("teacher_id, student_id")
        .eq("id", session.booking_id)
        .single();

      if (!booking) { failed++; continue; }

      const { data: teacherProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", booking.teacher_id)
        .single();

      const { error } = await supabase.from("session_materials").insert({
        session_id: session.id,
        teacher_id: booking.teacher_id,
        student_id: booking.student_id,
        title: "حصة مع " + (teacherProfile?.full_name || "معلم"),
        description: "مدة الحصة: " + session.duration_minutes + " دقيقة (إصلاح تلقائي)",
        recording_url: session.recording_url,
        duration_minutes: session.duration_minutes || 0,
        expires_at: new Date(new Date(session.ended_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });

      if (error) {
        failed++;
        await supabase.from("system_logs").insert({
          level: "error",
          source: "materials_monitor",
          message: "Auto-repair failed: " + error.message,
          metadata: { session_id: session.id },
        });
      } else {
        repaired++;
      }
    }

    for (const session of missingRecordingLinks) {
      const material = existingMap.get(session.id);
      if (!material) continue;

      const { error } = await supabase
        .from("session_materials")
        .update({ recording_url: session.recording_url })
        .eq("id", material.id);

      if (error) {
        failed++;
        await supabase.from("system_logs").insert({
          level: "error",
          source: "materials_monitor",
          message: "Recording link repair failed: " + error.message,
          metadata: { session_id: session.id, material_id: material.id },
        });
      } else {
        repairedLinks++;
      }
    }

    // 2. Alert if failure rate > 5%
    const totalSessions = sessions.length;
    const missingCount = missingSessions.length;
    const failureRate = totalSessions > 0 ? (missingCount / totalSessions) * 100 : 0;

    if (failureRate > 5 || failed >= 3) {
      // Send alert notification to all admins
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      for (const admin of (admins ?? [])) {
        await supabase.from("notifications").insert({
          user_id: admin.user_id,
          title: "⚠️ تنبيه: مشكلة في المواد التعليمية",
          body: `نسبة الفقد: ${failureRate.toFixed(1)}% | ناقصة: ${missingCount} | فشل الإصلاح: ${failed}`,
          type: "system_alert",
        });
      }

      await supabase.from("system_logs").insert({
        level: "warn",
        source: "materials_monitor",
        message: `High failure rate: ${failureRate.toFixed(1)}%`,
        metadata: { total: totalSessions, missing: missingCount, repaired, repaired_links: repairedLinks, failed },
      });
    }

    // 3. Log monitoring run
    await supabase.from("system_logs").insert({
      level: "info",
      source: "materials_monitor",
      message: "Monitoring run completed",
      metadata: { total: totalSessions, missing: missingCount, repaired, repaired_links: repairedLinks, failed },
    });

    return new Response(JSON.stringify({
      total: totalSessions,
      missing: missingCount,
      repaired,
      repaired_links: repairedLinks,
      failed,
      failure_rate: failureRate.toFixed(1) + "%",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
