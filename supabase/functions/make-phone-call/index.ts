import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PRICE_PER_MINUTE = 0.30;

async function getCallPricePerMinute(supabase: any): Promise<number> {
  try {
    const { data } = await supabase
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const PRICE_PER_MINUTE = await getCallPricePerMinute(supabase);

    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) throw new Error("Unauthorized");
    const teacherId = userData.user.id;

    const { studentPhone, estimatedMinutes, bookingId, studentId } = await req.json();

    if (!studentPhone || !estimatedMinutes || estimatedMinutes < 1) {
      return new Response(
        JSON.stringify({ success: false, error: "بيانات غير مكتملة" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize phone
    let normalizedPhone = studentPhone.replace(/\s+/g, "");
    if (normalizedPhone.startsWith("05")) {
      normalizedPhone = "+966" + normalizedPhone.substring(1);
    } else if (normalizedPhone.startsWith("966")) {
      normalizedPhone = "+" + normalizedPhone;
    } else if (!normalizedPhone.startsWith("+")) {
      normalizedPhone = "+" + normalizedPhone;
    }

    const requiredBalance = Math.ceil(estimatedMinutes) * PRICE_PER_MINUTE;

    // Check balance
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", teacherId)
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

    // Twilio call
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")!;
    const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER")!;

    const credentials = btoa(`${accountSid}:${authToken}`);
    const statusCallbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/call-status-webhook`;

    // WebSocket URL for media stream (replace https → wss)
    // Append apikey as query param — Supabase Edge Functions require it for WS auth even with verify_jwt=false
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const streamWsUrl = `${Deno.env.get("SUPABASE_URL")!.replace("https://", "wss://")}/functions/v1/twilio-media-stream?apikey=${anonKey}`;

    // ⚠️ Inline TwiML — privacy/legal warning + start media stream for live transcription
    // We need callLogId in stream params, so we insert call_log first (without sid), then issue call.
    // But Twilio call needs to start to get sid. Workaround: pass teacher/student IDs only here;
    // use callSid as the join key in the stream handler.
    const warningTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Zeina" language="arb">تنبيه قانوني من منصة أجيال المعرفة. يتم تسجيل وتحليل هذه المكالمة لحظياً لأغراض المراقبة والامتثال. يُمنع منعاً باتاً تبادل أي بيانات شخصية كأرقام الهواتف أو البريد أو حسابات التواصل. أي مخالفة قد تؤدي لإنهاء المكالمة وإيقاف الحساب نهائياً.</Say>
  <Pause length="1"/>
  <Start>
    <Stream url="${streamWsUrl}">
      <Parameter name="teacherId" value="${teacherId}"/>
      <Parameter name="studentId" value="${studentId || ''}"/>
      <Parameter name="bookingId" value="${bookingId || ''}"/>
    </Stream>
  </Start>
  <Say voice="Polly.Zeina" language="arb">سيتم الآن وصلكم بالمعلم.</Say>
</Response>`;

    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: (() => {
          const p = new URLSearchParams({
            From: fromNumber,
            To: normalizedPhone,
            Twiml: warningTwiml,
            StatusCallback: statusCallbackUrl,
            StatusCallbackMethod: "POST",
          });
          ["initiated", "ringing", "answered", "completed"].forEach((e) =>
            p.append("StatusCallbackEvent", e)
          );
          return p;
        })(),
      }
    );

    const callResult = await twilioRes.json();

    if (!twilioRes.ok) {
      // Log failed attempt
      await supabase.from("call_logs").insert({
        teacher_id: teacherId,
        student_id: studentId || null,
        booking_id: bookingId || null,
        student_phone: normalizedPhone,
        estimated_minutes: estimatedMinutes,
        cost: 0,
        status: "failed",
        error_message: callResult?.message || "Twilio error",
      });

      const isUnverified = callResult?.code === 21219;
      return new Response(
        JSON.stringify({
          success: false,
          code: isUnverified ? "TWILIO_TRIAL_UNVERIFIED_NUMBER" : "TWILIO_ERROR",
          error: isUnverified
            ? "رقم الطالب غير موثّق في حساب Twilio التجريبي."
            : callResult?.message || "فشل الاتصال",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduct balance atomically
    const { data: callLog, error: logErr } = await supabase
      .from("call_logs")
      .insert({
        teacher_id: teacherId,
        student_id: studentId || null,
        booking_id: bookingId || null,
        twilio_call_sid: callResult.sid,
        student_phone: normalizedPhone,
        estimated_minutes: estimatedMinutes,
        cost: requiredBalance,
        status: "initiated",
      })
      .select()
      .single();

    if (logErr) console.error("Log error:", logErr);

    const { data: newBalance } = await supabase.rpc("deduct_wallet_balance", {
      _user_id: teacherId,
      _amount: requiredBalance,
      _reference_id: callLog?.id || null,
      _description: `مكالمة هاتفية (${estimatedMinutes} دقيقة)`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        callSid: callResult.sid,
        callLogId: callLog?.id,
        newBalance,
        cost: requiredBalance,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("make-phone-call error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
