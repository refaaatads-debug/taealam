import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

interface CallRequest {
  bookingId: string;
}

interface TwilioGatewayError {
  code?: number;
  message?: string;
  more_info?: string;
  status?: number;
}

const parseTwilioGatewayError = (message: string): TwilioGatewayError | null => {
  const prefixMatch = message.match(/^Twilio error \[(\d+)\]:\s*(.+)$/);
  if (!prefixMatch) return null;

  const [, statusCode, rawPayload] = prefixMatch;

  try {
    return {
      status: Number(statusCode),
      ...(JSON.parse(rawPayload) as TwilioGatewayError),
    };
  } catch {
    return {
      status: Number(statusCode),
      message: rawPayload,
    };
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!TWILIO_PHONE_NUMBER) throw new Error("TWILIO_PHONE_NUMBER not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!TWILIO_API_KEY) throw new Error("Twilio connector not linked. Connect Twilio in Connectors.");

    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;

    const { bookingId }: CallRequest = await req.json();
    if (!bookingId) throw new Error("bookingId is required");

    // Service role client to fetch booking + phone numbers (bypass RLS)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: booking, error: bookingErr } = await admin
      .from("bookings")
      .select("teacher_id, student_id")
      .eq("id", bookingId)
      .single();
    if (bookingErr || !booking) throw new Error("Booking not found");

    // Only the teacher of this booking can initiate the hidden call
    if (callerId !== booking.teacher_id) {
      return new Response(JSON.stringify({ error: "Only the teacher can initiate this call" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    // Unique conference room per booking
    const conferenceName = `room-${bookingId}`;

    // TwiML that puts each party into the same conference room
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="ar">جاري ربطك بالطرف الآخر</Say><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">${conferenceName}</Conference></Dial></Response>`;

    const callParty = async (toNumber: string) => {
      const body = new URLSearchParams({
        From: TWILIO_PHONE_NUMBER,
        To: toNumber,
        Twiml: twiml,
      });

      const res = await fetch(`${GATEWAY_URL}/Calls.json`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": TWILIO_API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`Twilio error [${res.status}]: ${JSON.stringify(json)}`);
      return json.sid as string;
    };

    // Call both parties — they meet in the conference room
    const studentSid = await callParty(studentPhone);
    const teacherSid = await callParty(teacherPhone);

    // Log (no phone numbers stored in logs)
    await admin.from("system_logs").insert({
      level: "info",
      source: "twilio-call",
      message: "Hidden conference call initiated",
      metadata: {
        booking_id: bookingId,
        conference: conferenceName,
        student_sid: studentSid,
        teacher_sid: teacherSid,
      },
      user_id: callerId,
    });

    return new Response(
      JSON.stringify({ success: true, conference: conferenceName }),
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
