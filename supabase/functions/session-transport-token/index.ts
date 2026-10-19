import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";
import { RtcRole, RtcTokenBuilder } from "https://esm.sh/agora-token@2.0.7?bundle";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkEdgeRateLimit } from "../_shared/rate-limit.ts";
import { resolveBookingTransport } from "../_shared/booking-transport-policy.mjs";

const json = (body: unknown, status: number, headers: HeadersInit) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
  const rate = checkEdgeRateLimit(req, "session-transport-token", 12);
  if (!rate.allowed) return json({ error: "طلبات كثيرة، حاول لاحقاً" }, 429, cors);

  try {
    const authorization = req.headers.get("Authorization") || "";
    const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return json({ error: "Unauthorized" }, 401, cors);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "خدمة الجلسة غير مهيأة" }, 503, cors);
    }

    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await db.auth.getUser(accessToken);
    if (authError || !authData.user) return json({ error: "Unauthorized" }, 401, cors);

    const body = await req.json().catch(() => null);
    const bookingId = typeof body?.bookingId === "string" ? body.bookingId : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)) {
      return json({ error: "معرّف الحجز غير صالح" }, 400, cors);
    }

    const { data: booking, error: bookingError } = await db
      .from("bookings")
      .select("id, student_id, teacher_id, status, session_status")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return json({ error: "الحجز غير موجود" }, 404, cors);
    if (authData.user.id !== booking.student_id && authData.user.id !== booking.teacher_id) {
      return json({ error: "غير مصرح لك بدخول هذه الحصة" }, 403, cors);
    }
    if (
      booking.status !== "confirmed" ||
      ["cancelled", "completed"].includes(booking.session_status || "")
    ) {
      return json({ error: "الحجز غير متاح للاتصال" }, 409, cors);
    }

    let { data: pinned, error: pinnedError } = await db
      .from("booking_call_transports")
      .select("provider")
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (pinnedError) throw pinnedError;

    const choosePolicy = (pinnedProvider: string | null) =>
      resolveBookingTransport({
        pinnedProvider,
        sessionStatus: booking.session_status,
        agoraEnabled: Deno.env.get("AGORA_ENABLED") === "true",
      });
    let policy = choosePolicy(pinned?.provider ?? null);
    if (policy.error === "agora_disabled") {
      return json({ error: "Agora غير مفعّل للحصص الجديدة" }, 503, cors);
    }
    if (policy.error === "provider_conflict") {
      return json({ error: "هذا الحجز مثبت على WebRTC ولا يمكن بدء حصة جديدة عليه" }, 409, cors);
    }

    if (!pinned) {
      const { error: insertError } = await db
        .from("booking_call_transports")
        .upsert({ booking_id: bookingId, provider: policy.provider }, { onConflict: "booking_id", ignoreDuplicates: true });
      if (insertError) throw insertError;

      const { data: resolved, error: resolveError } = await db
        .from("booking_call_transports")
        .select("provider")
        .eq("booking_id", bookingId)
        .single();
      if (resolveError) throw resolveError;
      pinned = resolved;
    }

    policy = choosePolicy(pinned.provider);
    if (policy.error === "provider_conflict") {
      return json({ error: "هذا الحجز مثبت على WebRTC ولا يمكن بدء حصة جديدة عليه" }, 409, cors);
    }
    if (policy.error === "agora_disabled") {
      return json({ error: "Agora غير مفعّل للحصص الجديدة" }, 503, cors);
    }

    if (pinned.provider !== "agora") {
      return json({ provider: "webrtc", legacyActive: true }, 200, cors);
    }

    const appId = Deno.env.get("AGORA_APP_ID");
    const appCertificate = Deno.env.get("AGORA_APP_CERTIFICATE");
    if (!appId || !appCertificate) {
      return json({ error: "إعداد Agora غير مكتمل" }, 503, cors);
    }
    const channel = `ajyal_${bookingId.replaceAll("-", "")}`;
    const uid = authData.user.id;
    const expireAt = Math.floor(Date.now() / 1000) + 60 * 60;
    const token = RtcTokenBuilder.buildTokenWithUserAccount(
      appId,
      appCertificate,
      channel,
      uid,
      RtcRole.PUBLISHER,
      expireAt,
      expireAt,
    );
    return json({ provider: "agora", appId, channel, uid, token, expiresAt: expireAt }, 200, cors);
  } catch (error) {
    console.error("session-transport-token error:", error);
    return json({ error: "تعذر تجهيز اتصال الحصة" }, 500, cors);
  }
});
