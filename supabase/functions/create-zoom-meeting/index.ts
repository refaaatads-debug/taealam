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
    throw new Error("Zoom credentials not configured");
  }

  const credentials = btoa(`${clientId}:${clientSecret}`);
  const resp = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}` },
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Zoom token error: ${err}`);
  }

  const { access_token } = await resp.json();
  return access_token;
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

    const { data: booking } = await adminClient
      .from("bookings")
      .select("*, profiles!bookings_student_id_fkey(full_name)")
      .eq("id", booking_id)
      .single();

    if (!booking) {
      return new Response(JSON.stringify({ error: "الحجز غير موجود" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If meeting link already exists, return it
    if (booking.meeting_link) {
      return new Response(JSON.stringify({ meeting_link: booking.meeting_link }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getZoomAccessToken();

    const meetingResp = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: `حصة تعليمية - ${booking_id.slice(0, 8)}`,
        type: 2, // Scheduled meeting
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
      throw new Error(`Zoom API error: ${err}`);
    }

    const meeting = await meetingResp.json();

    // Save meeting link to booking
    await adminClient
      .from("bookings")
      .update({ meeting_link: meeting.join_url })
      .eq("id", booking_id);

    return new Response(JSON.stringify({
      meeting_link: meeting.join_url,
      meeting_id: meeting.id,
      password: meeting.password,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Zoom error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "خطأ" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
