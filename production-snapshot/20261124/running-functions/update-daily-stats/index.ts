import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get yesterday's date (or today if running mid-day)
    const today = new Date().toISOString().split("T")[0];

    // Get all completed sessions with their bookings
    const { data: sessions, error: sessError } = await supabase
      .from("sessions")
      .select("booking_id, duration_minutes, ended_at")
      .not("ended_at", "is", null)
      .eq("short_session", false);

    if (sessError) throw sessError;

    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({ message: "No sessions to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get booking teacher_ids
    const bookingIds = sessions.map((s) => s.booking_id);
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, teacher_id")
      .in("id", bookingIds);

    const bookingTeacherMap = new Map((bookings ?? []).map((b) => [b.id, b.teacher_id]));

    // Aggregate by teacher + date
    const statsMap = new Map<string, { minutes: number; sessions: number }>();

    for (const session of sessions) {
      const teacherId = bookingTeacherMap.get(session.booking_id);
      if (!teacherId || !session.ended_at || !session.duration_minutes) continue;

      const date = session.ended_at.split("T")[0];
      const key = `${teacherId}__${date}`;
      const existing = statsMap.get(key) || { minutes: 0, sessions: 0 };
      existing.minutes += session.duration_minutes;
      existing.sessions += 1;
      statsMap.set(key, existing);
    }

    // Upsert into teacher_daily_stats
    let upsertCount = 0;
    for (const [key, val] of statsMap) {
      const [teacherId, date] = key.split("__");

      const { error: upsertError } = await supabase
        .from("teacher_daily_stats")
        .upsert({
          teacher_id: teacherId,
          date,
          total_minutes: val.minutes,
          total_sessions: val.sessions,
        }, { onConflict: "teacher_id,date" });

      if (upsertError) throw upsertError;
      upsertCount++;
    }

    return new Response(
      JSON.stringify({ message: `Updated ${upsertCount} daily stats records`, date: today }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("update-daily-stats error:", error);
    return new Response(JSON.stringify({ error: "تعذر تحديث الإحصائيات اليومية" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
