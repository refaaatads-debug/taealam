import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { booking_id, recording_url } = await req.json();
    if (!booking_id || !recording_url) {
      return new Response(JSON.stringify({ error: "booking_id and recording_url are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("id, teacher_id, student_id")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (user.id !== booking.teacher_id && user.id !== booking.student_id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: session, error: sessionError } = await admin
      .from("sessions")
      .select("id, started_at, ended_at, duration_minutes")
      .eq("booking_id", booking_id)
      .single();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updateSessionError } = await admin
      .from("sessions")
      .update({ recording_url })
      .eq("id", session.id);

    if (updateSessionError) {
      throw updateSessionError;
    }

    let materialUpdated = false;
    let materialCreated = false;
    const sessionDuration = session.duration_minutes ?? 0;
    const shouldSaveToMaterials = !!session.ended_at && sessionDuration >= 5;

    if (shouldSaveToMaterials) {
      const { data: existingMaterial } = await admin
        .from("session_materials")
        .select("id")
        .eq("session_id", session.id)
        .maybeSingle();

      if (existingMaterial) {
        const { error: updateMaterialError } = await admin
          .from("session_materials")
          .update({ recording_url })
          .eq("id", existingMaterial.id);

        if (updateMaterialError) throw updateMaterialError;
        materialUpdated = true;
      } else {
        const { data: teacherProfile } = await admin
          .from("profiles")
          .select("full_name")
          .eq("user_id", booking.teacher_id)
          .maybeSingle();

        const expiresAt = new Date(
          new Date(session.ended_at ?? new Date().toISOString()).getTime() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString();

        const { error: insertMaterialError } = await admin.from("session_materials").insert({
          session_id: session.id,
          teacher_id: booking.teacher_id,
          student_id: booking.student_id,
          title: `حصة مع ${teacherProfile?.full_name || "معلم"}`,
          description: `مدة الحصة: ${sessionDuration} دقيقة`,
          recording_url,
          duration_minutes: sessionDuration,
          expires_at: expiresAt,
        });

        if (insertMaterialError) throw insertMaterialError;
        materialCreated = true;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      session_id: session.id,
      material_updated: materialUpdated,
      material_created: materialCreated,
      linked_to_materials: shouldSaveToMaterials,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("save-session-recording error:", error);

    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});