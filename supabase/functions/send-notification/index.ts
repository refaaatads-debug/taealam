import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const notifications: Array<{ user_id: string; title: string; body: string; type: string }> = [];

    if (type === "pre_session" || type === "all") {
      // Get bookings starting in next 30 minutes
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
        notifications.push({
          user_id: b.student_id,
          title: `⏰ حصتك بعد 30 دقيقة`,
          body: `حصة ${subj} ستبدأ قريباً. جهّز نفسك!`,
          type: "pre_session",
        });
        notifications.push({
          user_id: b.teacher_id,
          title: `⏰ حصتك بعد 30 دقيقة`,
          body: `حصة ${subj} ستبدأ قريباً.`,
          type: "pre_session",
        });
      }
    }

    if (type === "post_session" || type === "all") {
      // Get recently completed bookings without reviews
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const { data: completed } = await supabase
        .from("bookings")
        .select("id, student_id, teacher_id, subjects(name)")
        .eq("status", "completed")
        .gte("updated_at", oneHourAgo.toISOString());

      for (const b of completed || []) {
        const { data: review } = await supabase
          .from("reviews")
          .select("id")
          .eq("booking_id", b.id)
          .single();

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
      // Get subscriptions expiring in 3 days
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

    if (notifications.length > 0) {
      await supabase.from("notifications").insert(notifications);
    }

    return new Response(JSON.stringify({ sent: notifications.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Notification error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
