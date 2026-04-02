import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getZoomAccessToken(): Promise<string> {
  const accountId = Deno.env.get("ZOOM_ACCOUNT_ID");
  const clientId = Deno.env.get("ZOOM_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");

  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Zoom credentials not configured. Please set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET.");
  }

  const credentials = btoa(`${clientId}:${clientSecret}`);
  
  console.log("Requesting Zoom access token...");
  
  const resp = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}` },
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    console.error("Zoom token error response:", err);
    throw new Error(`Zoom token error (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  console.log("Zoom token obtained successfully");
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { booking_id } = await req.json();
    if (!booking_id) {
      return new Response(JSON.stringify({ error: "booking_id مطلوب" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: booking, error: bookingError } = await adminClient
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      console.error("Booking fetch error:", bookingError);
      return new Response(JSON.stringify({ error: "الحجز غير موجود" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is part of this booking
    if (user.id !== booking.student_id && user.id !== booking.teacher_id) {
      return new Response(JSON.stringify({ error: "غير مصرح بالوصول لهذا الحجز" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If meeting link already exists, return it
    if (booking.meeting_link) {
      console.log("Returning existing meeting link");
      return new Response(JSON.stringify({ meeting_link: booking.meeting_link }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Creating new Zoom meeting for booking:", booking_id);
    const accessToken = await getZoomAccessToken();

    const meetingResp = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: `حصة تعليمية - ${booking_id.slice(0, 8)}`,
        type: 2,
        start_time: booking.scheduled_at,
        duration: booking.duration_minutes || 60,
        timezone: "Asia/Riyadh",
        settings: {
          join_before_host: true,
          waiting_room: false,
          auto_recording: "cloud",
          mute_upon_entry: true,
        },
      }),
    });

    if (!meetingResp.ok) {
      const err = await meetingResp.text();
      console.error("Zoom meeting creation error:", err);
      throw new Error(`Zoom API error (${meetingResp.status}): ${err}`);
    }

    const meeting = await meetingResp.json();
    console.log("Zoom meeting created successfully:", meeting.id);

    // Save meeting link to booking
    const { error: updateError } = await adminClient
      .from("bookings")
      .update({ meeting_link: meeting.join_url })
      .eq("id", booking_id);

    if (updateError) {
      console.error("Failed to save meeting link:", updateError);
    }

    return new Response(JSON.stringify({
      meeting_link: meeting.join_url,
      meeting_id: meeting.id,
      password: meeting.password,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Zoom error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "خطأ في إنشاء اجتماع Zoom" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
