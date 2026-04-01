import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { subject, student_level, budget_max } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get teachers with their subjects and profiles
    let query = supabase
      .from("teacher_profiles")
      .select(`
        *,
        profiles!teacher_profiles_user_id_fkey(full_name, avatar_url),
        teacher_subjects!teacher_subjects_teacher_id_fkey(
          subjects!teacher_subjects_subject_id_fkey(name)
        )
      `)
      .eq("is_verified", true)
      .order("avg_rating", { ascending: false })
      .limit(10);

    if (budget_max) {
      query = query.lte("hourly_rate", budget_max);
    }

    const { data: teachers, error } = await query;
    if (error) throw error;

    // Filter by subject if provided
    let filtered = teachers || [];
    if (subject) {
      filtered = filtered.filter((t: any) =>
        t.teacher_subjects?.some((ts: any) => ts.subjects?.name === subject)
      );
    }

    // Score and rank teachers
    const scored = filtered.map((t: any) => {
      let score = 0;
      score += (t.avg_rating || 0) * 20; // Max 100
      score += Math.min((t.total_sessions || 0) / 10, 30); // Max 30 for experience
      score += Math.min((t.total_reviews || 0) / 5, 20); // Max 20 for reviews
      score += (t.years_experience || 0) * 2; // Experience bonus
      
      return {
        id: t.id,
        user_id: t.user_id,
        name: t.profiles?.full_name || "مدرس",
        avatar_url: t.profiles?.avatar_url,
        subject: t.teacher_subjects?.[0]?.subjects?.name || subject || "عام",
        rating: t.avg_rating || 0,
        total_sessions: t.total_sessions || 0,
        total_reviews: t.total_reviews || 0,
        hourly_rate: t.hourly_rate,
        years_experience: t.years_experience || 0,
        bio: t.bio,
        is_verified: t.is_verified,
        match_score: Math.round(score),
        match_reason: getMatchReason(score, t),
      };
    });

    scored.sort((a: any, b: any) => b.match_score - a.match_score);

    return new Response(JSON.stringify({ teachers: scored.slice(0, 3) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Smart matching error:", e);
    return new Response(JSON.stringify({ error: "حدث خطأ في نظام التوصيات" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getMatchReason(score: number, teacher: any): string {
  if (score > 80) return "أفضل تطابق بناءً على التقييم والخبرة";
  if ((teacher.avg_rating || 0) >= 4.8) return "تقييم ممتاز من الطلاب";
  if ((teacher.total_sessions || 0) > 50) return "خبرة واسعة في التدريس";
  if ((teacher.years_experience || 0) > 5) return "سنوات خبرة طويلة في المجال";
  return "مدرس مميز ومعتمد";
}
