import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";
import { callWalletAmount } from "../_shared/call-wallet-amount.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkEdgeRateLimit } from "../_shared/rate-limit.ts";

async function signStream(secret: string, teacher: string, student: string, booking: string, expires: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key,
    new TextEncoder().encode(`${teacher}|${student}|${booking}|${expires}`));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

interface CallRequest {
  bookingId?: string;
  studentId?: string;
  estimatedMinutes?: number;
}

interface TwilioGatewayError {
  code?: number;
  message?: string;
  more_info?: string;
  status?: number;
}

const DEFAULT_PRICE_PER_MINUTE = 0.30;

async function getCallPricePerMinute(admin: any): Promise<number> {
  try {
    const { data } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", "call_price_per_minute")
      .maybeSingle();
    const v = parseFloat(data?.value);
    return isNaN(v) || v < 0 ? DEFAULT_PRICE_PER_MINUTE : v;
  } catch {
    return DEFAULT_PRICE_PER_MINUTE;
  }
}

const parseTwilioGatewayError = (message: string): TwilioGatewayError | null => {
  const prefixMatch = message.match(/^Twilio error \[(\d+)\]:\s*(.+)$/);
  if (!prefixMatch) return null;
  const [, statusCode, rawPayload] = prefixMatch;
  try {
    return { status: Number(statusCode), ...(JSON.parse(rawPayload) as TwilioGatewayError) };
  } catch {
    return { status: Number(statusCode), message: rawPayload };
  }
};

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const rate = checkEdgeRateLimit(req, "twilio-call", 5);
  if (!rate.allowed) return new Response(JSON.stringify({ error: "طلبات كثيرة، حاول لاحقاً" }), {
    status: 429,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rate.retryAfterSeconds) },
  });

  try {
    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!TWILIO_PHONE_NUMBER) throw new Error("TWILIO_PHONE_NUMBER not configured");
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) throw new Error("TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not configured");

    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;

    const { bookingId: requestedBookingId, studentId, estimatedMinutes: reqMinutes }: CallRequest = await req.json();
    if (!requestedBookingId && !studentId) return new Response(
      JSON.stringify({ success: false, error: "يلزم تحديد الحجز أو الطالب" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get price from site_settings
    const PRICE_PER_MINUTE = await getCallPricePerMinute(admin);

    let bookingQuery = admin
      .from("bookings")
      .select("id, teacher_id, student_id, duration_minutes, status")
      .eq("teacher_id", callerId);
    bookingQuery = requestedBookingId
      ? bookingQuery.eq("id", requestedBookingId)
      : bookingQuery.eq("student_id", studentId!).in("status", ["confirmed", "completed"])
        .order("scheduled_at", { ascending: false }).limit(1);
    const { data: booking, error: bookingErr } = await bookingQuery.maybeSingle();
    if (bookingErr || !booking) throw new Error("Booking not found");

    if (callerId !== booking.teacher_id || !["confirmed", "completed"].includes(booking.status)
      || (studentId && studentId !== booking.student_id)) {
      return new Response(JSON.stringify({ error: "Only the teacher can initiate this call" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Estimated minutes: request param → booking duration → fallback 30
    const bookingId = booking.id;
    const estimatedMinutes = reqMinutes ?? booking.duration_minutes ?? 30;
    if (!Number.isSafeInteger(estimatedMinutes) || estimatedMinutes < 1) return new Response(
      JSON.stringify({ success: false, error: "مدة الاتصال غير صالحة" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const requiredBalance = callWalletAmount(estimatedMinutes, PRICE_PER_MINUTE);

    // ── FIX 1: Check wallet balance before making any calls ──
    const { data: wallet } = await admin
      .from("wallets")
      .select("balance")
      .eq("user_id", callerId)
      .maybeSingle();

    if (!wallet || Number(wallet.balance) < requiredBalance) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "INSUFFICIENT_BALANCE",
          error: `رصيد غير كافٍ. مطلوب ${requiredBalance.toFixed(2)} ريال — رصيدك ${Number(wallet?.balance || 0).toFixed(2)} ريال`,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profiles, error: profilesErr } = await admin
      .from("profiles")
      .select("user_id, phone")
      .in("user_id", [booking.teacher_id, booking.student_id]);
    if (profilesErr) throw profilesErr;

    const normalizePhone = (value: unknown) => {
      if (typeof value !== "string") return "";
      let number = value.replace(/[\s()-]/g, "");
      if (number.startsWith("05")) number = "+966" + number.slice(1);
      else if (!number.startsWith("+")) number = "+" + number;
      return /^\+[1-9]\d{7,14}$/.test(number) ? number : "";
    };
    const teacherPhone = normalizePhone(profiles?.find((p) => p.user_id === booking.teacher_id)?.phone);
    const studentPhone = normalizePhone(profiles?.find((p) => p.user_id === booking.student_id)?.phone);

    if (!teacherPhone) throw new Error("رقم هاتف المعلم غير متوفر في الملف الشخصي");
    if (!studentPhone) throw new Error("رقم هاتف الطالب غير متوفر في الملف الشخصي");

    const conferenceName = `room-${crypto.randomUUID()}`;
    const statusCallbackUrl = `${SUPABASE_URL}/functions/v1/call-status-webhook`;
    const twilioAuth = "Basic " + btoa(TWILIO_ACCOUNT_SID + ":" + TWILIO_AUTH_TOKEN);

    // Preserve the legal notice and authenticated live-monitoring stream.
    const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;
    const streamSignature = await signStream(TWILIO_AUTH_TOKEN, booking.teacher_id, booking.student_id, bookingId, expiresAt);
    const streamUrl = `${SUPABASE_URL.replace(/^https:/, "wss:").replace(/^http:/, "ws:")}/functions/v1/twilio-media-stream?apikey=${SUPABASE_ANON_KEY}`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response>
      <Say voice="Polly.Zeina" language="arb">تنبيه قانوني من منصة أجيال المعرفة. يتم تسجيل وتحليل هذه المكالمة لحظياً لأغراض المراقبة والامتثال. يُمنع تبادل البيانات الشخصية كأرقام الهواتف والبريد وحسابات التواصل.</Say>
      <Start><Stream url="${streamUrl}"><Parameter name="teacherId" value="${booking.teacher_id}"/><Parameter name="studentId" value="${booking.student_id}"/><Parameter name="bookingId" value="${bookingId}"/><Parameter name="streamExpiresAt" value="${expiresAt}"/><Parameter name="streamSignature" value="${streamSignature}"/></Stream></Start>
      <Say language="ar">جاري ربطك بالطرف الآخر</Say><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">${conferenceName}</Conference></Dial></Response>`;

    const callParty = async (toNumber: string): Promise<string> => {
      const body = new URLSearchParams({
        From: TWILIO_PHONE_NUMBER,
        To: toNumber,
        TimeLimit: String(estimatedMinutes * 60),
        Twiml: twiml,
        StatusCallback: statusCallbackUrl,
        StatusCallbackMethod: "POST",
      });
      ["initiated", "ringing", "answered", "completed"].forEach((e) =>
        body.append("StatusCallbackEvent", e)
      );
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
        { method: "POST", headers: { Authorization: twilioAuth, "Content-Type": "application/x-www-form-urlencoded" }, body }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(`Twilio request failed [${res.status}]`);
      return json.sid as string;
    };

    // ── FIX 1: Deduct wallet before connecting calls ──
    const { data: callLog, error: logError } = await admin
      .from("call_logs")
      .insert({
        teacher_id: booking.teacher_id,
        student_id: booking.student_id,
        booking_id: bookingId,
        estimated_minutes: estimatedMinutes,
        cost: requiredBalance,
        status: "initiated",
      })
      .select()
      .single();
    if (logError || !callLog) throw new Error("Call record creation failed");

    const { data: newBalance, error: deductionError } = requiredBalance > 0
      ? await admin.rpc("deduct_wallet_balance", {
      _user_id: callerId,
      _amount: requiredBalance,
      _reference_id: callLog?.id || null,
      _description: `مكالمة هاتفية مؤتمر (${estimatedMinutes} دقيقة)`,
    }) : { data: Number(wallet.balance), error: null };
    if (deductionError) {
      await admin.from("call_logs").update({ status: "failed", cost: 0 })
        .eq("id", callLog?.id);
      throw new Error("Wallet reservation failed");
    }

    // Call both parties
    let studentSid = "";
    let teacherSid = "";
    try {
      studentSid = await callParty(studentPhone);
      teacherSid = await callParty(teacherPhone);
    } catch {
      // Stop any successfully created leg; never leave a party in an orphan conference.
      for (const sid of [studentSid, teacherSid].filter(Boolean)) {
        try {
          for (const status of ["completed", "canceled"]) {
            const stopped = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${sid}.json`, {
              method: "POST", headers: { Authorization: twilioAuth, "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ Status: status }),
            });
            if (stopped.ok) break; // queued legs need canceled; answered legs need completed.
          }
        } catch { console.error("Conference leg cleanup failed"); }
      }
      // Refund if calls failed after deduction
      if (requiredBalance > 0) await admin.rpc("credit_wallet_balance", {
        _user_id: callerId,
        _amount: requiredBalance,
        _stripe_session_id: `refund_conf_${callLog?.id || Date.now()}`,
        _description: "استرداد كامل - فشل بدء مكالمة المؤتمر",
      });
      await admin.from("call_logs").update({ status: "failed", error_message: "تعذر بدء مكالمة المؤتمر", cost: 0 })
        .eq("id", callLog?.id);
      throw new Error("Conference call setup failed");
    }

    // Update call_log with teacher's SID (primary for tracking)
    await admin.from("call_logs").update({
      twilio_call_sid: teacherSid,
      status: "ringing",
    }).eq("id", callLog?.id);

    await admin.from("system_logs").insert({
      level: "info",
      source: "twilio-call",
      message: "Hidden conference call initiated",
      metadata: {
        booking_id: bookingId,
        conference: conferenceName,
        student_sid: studentSid,
        teacher_sid: teacherSid,
        call_log_id: callLog?.id,
        reserved_balance: requiredBalance,
      },
      user_id: callerId,
    });

    return new Response(
      JSON.stringify({ success: true, conference: conferenceName, callLogId: callLog.id, cost: requiredBalance, newBalance }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const twilioError = parseTwilioGatewayError(errorMessage);

    if (twilioError?.code === 21219) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "TWILIO_TRIAL_UNVERIFIED_NUMBER",
          error: "الرقم المطلوب غير موثّق في حساب Twilio التجريبي. قم بتوثيق الرقم في Twilio أو ترقية الحساب.",
          twilioCode: twilioError.code,
          moreInfo: twilioError.more_info,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  console.error("twilio-call request failed");
    return new Response(
      JSON.stringify({ success: false, error: "تعذر بدء المكالمة" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
