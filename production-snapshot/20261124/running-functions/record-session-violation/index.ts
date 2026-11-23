import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";
import { getCorsHeaders } from "../_shared/cors.ts";

// Teacher punctuality and silence reports from the live session page.
// The server decides; the client only reports what it saw.
const LATE_GRACE_MINUTES = 10;
const SILENCE_MIN_SECONDS = 300;
const ALLOWED_TYPES = new Set(["teacher_late", "teacher_silence"]);

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: userData, error: authError } = await admin.auth.getUser(token);
    const userId = userData?.user?.id;
    if (authError || !userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body.booking_id === "string" ? body.booking_id : "";
    const violationType = typeof body.violation_type === "string" ? body.violation_type : "";
    if (!bookingId || !ALLOWED_TYPES.has(violationType)) return json({ error: "Invalid request" }, 400);

    const { data: booking } = await admin
      .from("bookings")
      .select("id, teacher_id, scheduled_at")
      .eq("id", bookingId)
      .maybeSingle();
    // Only the booking's own teacher can generate a report about themselves.
    if (!booking || booking.teacher_id !== userId) return json({ error: "Forbidden" }, 403);

    let detectedText = "";
    let timestampInSession: number | null = null;
    if (violationType === "teacher_late") {
      const lateMinutes = (Date.now() - new Date(booking.scheduled_at).getTime()) / 60000;
      if (lateMinutes <= LATE_GRACE_MINUTES) return json({ recorded: false, reason: "within_grace" });
      detectedText = `انضم المعلم بعد ${Math.round(lateMinutes)} دقيقة من موعد الحصة`;
    } else {
      const seconds = Number(body.duration_seconds);
      if (!Number.isFinite(seconds) || seconds < SILENCE_MIN_SECONDS) {
        return json({ recorded: false, reason: "below_threshold" });
      }
      detectedText = `صمت المعلم لمدة ${Math.round(seconds / 60)} دقائق أثناء الحصة`;
      timestampInSession = Math.round(seconds);
    }

    const { data: existing } = await admin
      .from("violations")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("user_id", userId)
      .eq("violation_type", violationType)
      .limit(1);
    if (existing && existing.length > 0) return json({ recorded: false, duplicate: true });

    const { error: insertError } = await admin.from("violations").insert({
      booking_id: bookingId,
      user_id: userId,
      violation_type: violationType,
      detected_text: detectedText,
      confidence_score: 1,
      source: typeof body.source === "string" ? body.source.slice(0, 40) : "session",
      timestamp_in_session: timestampInSession,
    });
    if (insertError) {
      console.error("record-session-violation insert failed:", insertError.message);
      return json({ error: "تعذر تسجيل المخالفة" }, 500);
    }
    return json({ success: true, recorded: true });
  } catch (e) {
    console.error("record-session-violation error:", e);
    return json({ error: "تعذر تسجيل المخالفة" }, 500);
  }
});
