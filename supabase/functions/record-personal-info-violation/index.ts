import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";
import { getCorsHeaders } from "../_shared/cors.ts";
import { detectPersonalInfo, maskedEvidence } from "../_shared/personalInfo.ts";

// Records a personal-info violation from the live session (chat or the user's own voice).
// The browser only sends the text. The server re-runs the detector, checks the user is in the
// booking, stores only redacted evidence, and writes with the service role (normal users cannot insert into violations).
const ALLOWED_SOURCES = new Set(["chat", "voice"]);
const HIGH_TYPES = new Set(["phone_number", "email", "contact_sharing", "address_sharing", "social_media_attempt", "external_link"]);

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
    const source = typeof body.source === "string" ? body.source : "";
    const text = typeof body.text === "string" ? body.text.slice(0, 1000) : "";
    if (!bookingId || !ALLOWED_SOURCES.has(source) || !text.trim()) return json({ error: "Invalid request" }, 400);

    const { data: booking } = await admin
      .from("bookings").select("id, teacher_id, student_id").eq("id", bookingId).maybeSingle();
    if (!booking || (booking.teacher_id !== userId && booking.student_id !== userId)) {
      return json({ error: "Forbidden" }, 403);
    }

    const result = detectPersonalInfo(text);
    if (!result.detected || !result.type) return json({ recorded: false, reason: "not_detected" });

    // Only the booking teacher's own voice is monitored. Chat is checked for both sides.
    if (source === "voice" && booking.teacher_id !== userId) return json({ recorded: false, reason: "voice_teacher_only" });

    // Store redacted evidence only (kinds + masked fragments). The raw sentence is never saved.
    const evidence = maskedEvidence(result, text);

    // Same evidence from the same user in the same booking within 2 minutes is recorded once.
    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: dup } = await admin.from("violations").select("id")
      .eq("booking_id", bookingId).eq("user_id", userId).eq("original_message", evidence).gte("created_at", since).limit(1);
    if (dup && dup.length > 0) return json({ recorded: false, duplicate: true });

    const seconds = Number(body.timestamp_in_session);
    const { error: insertError } = await admin.from("violations").insert({
      booking_id: bookingId,
      user_id: userId,
      violation_type: result.type,
      detected_text: evidence,
      original_message: evidence,
      confidence_score: source === "chat" ? 1 : 0.8,
      source,
      timestamp_in_session: Number.isFinite(seconds) ? Math.round(seconds) : null,
    });
    if (insertError) {
      console.error("record-personal-info-violation insert failed:", insertError.message);
      return json({ error: "تعذر تسجيل المخالفة" }, 500);
    }

    const { count } = await admin.from("violations").select("id", { count: "exact", head: true })
      .eq("booking_id", bookingId).eq("user_id", userId);

    if (HIGH_TYPES.has(result.type)) {
      const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "admin");
      for (const a of admins || []) {
        await admin.from("notifications").insert({
          user_id: a.user_id,
          title: "⚠️ مخالفة مشاركة بيانات شخصية",
          body: `${source === "voice" ? "صوت" : "دردشة"}: ${evidence}`,
          type: "violation",
        });
      }
    }
    return json({ recorded: true, violation_type: result.type, count: count ?? 1 });
  } catch (e) {
    console.error("record-personal-info-violation error:", e);
    return json({ error: "تعذر تسجيل المخالفة" }, 500);
  }
});
