import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isServiceRole = token === serviceKey;

    // Parse body early so we know the type before auth check
    const payload = await req.json();
    const { type } = payload;

    // teacher_cancellation_warning: any authenticated user (teacher) may call this
    // All other types (cron-style): require admin or service-role
    let authenticatedUserId: string | null = null;
    if (!isServiceRole) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: claimsData, error: claimsError } = await userClient.auth.getUser(token);
      const userId = claimsData?.user?.id;
      if (claimsError || !userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      authenticatedUserId = userId;

      // For cron-style batch notifications require admin role
      if (type !== "teacher_cancellation_warning") {
        const { data: roleRow } = await userClient
          .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
        if (!roleRow) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const notifications: Array<{ user_id: string; title: string; body: string; type: string; link?: string }> = [];

    if (type === "pre_session" || type === "all") {
      const now = new Date();
      const in30min = new Date(now.getTime() + 30 * 60 * 1000);
      const { data: upcoming } = await supabase
        .from("bookings")
        .select("id, student_id, teacher_id, scheduled_at, subjects(name)")
        .eq("status", "confirmed")
        .gte("scheduled_at", now.toISOString())
        .lte("scheduled_at", in30min.toISOString());

      for (const b of upcoming || []) {
        const subj = (b as any).subjects?.name || "حصة";
        notifications.push({ user_id: b.student_id, title: `⏰ حصتك بعد 30 دقيقة`, body: `حصة ${subj} ستبدأ قريباً. جهّز نفسك!`, type: "pre_session" });
        notifications.push({ user_id: b.teacher_id, title: `⏰ حصتك بعد 30 دقيقة`, body: `حصة ${subj} ستبدأ قريباً.`, type: "pre_session" });
      }
    }

    if (type === "post_session" || type === "all") {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const { data: completed } = await supabase
        .from("bookings")
        .select("id, student_id, teacher_id, subjects(name)")
        .eq("status", "completed")
        .gte("updated_at", oneHourAgo.toISOString());

      for (const b of completed || []) {
        const { data: review } = await supabase.from("reviews").select("id").eq("booking_id", b.id).single();
        if (!review) {
          notifications.push({
            user_id: b.student_id,
            title: "⭐ قيّم حصتك",
            body: `كيف كانت حصة ${(b as any).subjects?.name || "اليوم"}؟ شاركنا رأيك`,
            type: "post_session",
          });
        }
      }
    }

    if (type === "subscription_expiry" || type === "all") {
      const in3days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const { data: expiring } = await supabase
        .from("user_subscriptions")
        .select("user_id, ends_at, subscription_plans(name_ar)")
        .eq("is_active", true)
        .lte("ends_at", in3days.toISOString());

      for (const s of expiring || []) {
        notifications.push({
          user_id: s.user_id,
          title: "📋 اشتراكك ينتهي قريباً",
          body: `باقة ${(s as any).subscription_plans?.name_ar || ""} تنتهي خلال أيام. جدّد الآن!`,
          type: "subscription_expiry",
        });
      }
    }

    if (type === "teacher_cancellation_warning") {
      const {
        bookingId,
        teacherId,
        teacherName,
        studentId,
        reason,
        cancellationCount,
        monthlyLimit,
      } = payload;

      if (!bookingId || !teacherId || !reason) {
        return new Response(JSON.stringify({ error: "Missing cancellation payload" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Security: authenticated teacher must only cancel their own bookings
      if (!isServiceRole && authenticatedUserId && authenticatedUserId !== teacherId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const toInsert: Array<{ user_id: string; title: string; body: string; type: string; link?: string }> = [];

      // Notify the student (using service key bypasses RLS)
      if (studentId) {
        toInsert.push({
          user_id: studentId,
          title: "🗑️ تم إلغاء حصتك",
          body: `قام المعلم ${teacherName || "معلمك"} بإلغاء الحصة. السبب: ${reason}`,
          type: "booking_cancelled",
        });
      }

      // Notify all admins
      const link = `/admin?tab=violations&booking=${bookingId}`;
      const { data: admins, error: adminsError } = await supabase
        .from("user_roles").select("user_id").eq("role", "admin");
      if (adminsError) throw adminsError;

      for (const admin of admins || []) {
        toInsert.push({
          user_id: admin.user_id,
          title: "🚨 إلغاء حصة من المعلم",
          body: `المعلم ${teacherName || teacherId} ألغى حصة${studentId ? " للطالب" : ""}. السبب: ${reason}. عدد الإلغاءات هذا الشهر: ${cancellationCount}/${monthlyLimit}`,
          type: "warning",
          link,
        });
      }

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase.from("notifications").insert(toInsert as any);
        if (insertError) throw insertError;
      }

      const adminCount = (admins || []).length;
      return new Response(JSON.stringify({ sent: toInsert.length, adminRecipients: adminCount, studentNotified: !!studentId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (notifications.length > 0) {
      await supabase.from("notifications").insert(notifications);
    }

    return new Response(JSON.stringify({ sent: notifications.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Notification error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
