import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CallRequest {
  bookingId: string;
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    const { bookingId, estimatedMinutes: reqMinutes }: CallRequest = await req.json();
    if (!bookingId) throw new Error("bookingId is required");

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get price from site_settings
    const PRICE_PER_MINUTE = await getCallPricePerMinute(admin);

    const { data: booking, error: bookingErr } = await admin
      .from("bookings")
      .select("teacher_id, student_id, duration_minutes")
      .eq("id", bookingId)
      .single();
    if (bookingErr || !booking) throw new Error("Booking not found");

    if (callerId !== booking.teacher_id) {
      return new Response(JSON.stringify({ error: "Only the teacher can initiate this call" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Estimated minutes: request param → booking duration → fallback 30
    const estimatedMinutes = reqMinutes || booking.duration_minutes || 30;
    const requiredBalance = Math.ceil(estimatedMinutes) * PRICE_PER_MINUTE;

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

    const teacherPhone = profiles?.find((p) => p.user_id === booking.teacher_id)?.phone;
    const studentPhone = profiles?.find((p) => p.user_id === booking.student_id)?.phone;

    if (!teacherPhone) throw new Error("رقم هاتف المعلم غير متوفر في الملف الشخصي");
    if (!studentPhone) throw new Error("رقم هاتف الطالب غير متوفر في الملف الشخصي");

    const conferenceName = `room-${bookingId}`;
    const statusCallbackUrl = `${SUPABASE_URL}/functions/v1/call-status-webhook`;
    const twilioAuth = "Basic " + btoa(TWILIO_ACCOUNT_SID + ":" + TWILIO_AUTH_TOKEN);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="ar">جاري ربطك بالطرف الآخر</Say><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">${conferenceName}</Conference></Dial></Response>`;

    const callParty = async (toNumber: string): Promise<string> => {
      const body = new URLSearchParams({
        From: TWILIO_PHONE_NUMBER,
        To: toNumber,
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
      if (!res.ok) throw new Error(`Twilio error [${res.status}]: ${JSON.stringify(json)}`);
      return json.sid as string;
    };

    // ── FIX 1: Deduct wallet before connecting calls ──
    const { data: callLog } = await admin
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

    await admin.rpc("deduct_wallet_balance", {
      _user_id: callerId,
      _amount: requiredBalance,
      _reference_id: callLog?.id || null,
      _description: `مكالمة هاتفية مؤتمر (${estimatedMinutes} دقيقة)`,
    });

    // Call both parties
    let studentSid = "";
    let teacherSid = "";
    try {
      studentSid = await callParty(studentPhone);
      teacherSid = await callParty(teacherPhone);
    } catch (callErr) {
      // Refund if calls failed after deduction
      await admin.rpc("credit_wallet_balance", {
        _user_id: callerId,
        _amount: requiredBalance,
        _stripe_session_id: `refund_conf_${callLog?.id || Date.now()}`,
        _description: "استرداد كامل - فشل بدء مكالمة المؤتمر",
      });
      await admin.from("call_logs").update({ status: "failed", error_message: String(callErr), cost: 0 })
        .eq("id", callLog?.id);
      throw callErr;
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
      JSON.stringify({ success: true, conference: conferenceName, callLogId: callLog?.id }),
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

    console.error("twilio-call error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
