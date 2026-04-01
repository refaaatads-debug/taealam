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

    // Get teachers
    let query = supabase
      .from("teacher_profiles")
      .select("*")
      .eq("is_approved", true)
      .order("avg_rating", { ascending: false })
      .limit(20);

    if (budget_max) {
      query = query.lte("hourly_rate", budget_max);
    }

    const { data: teachers, error } = await query;
    if (error) throw error;

    // Get profiles and subjects separately
    const userIds = (teachers || []).map((t: any) => t.user_id);
    const teacherIds = (teachers || []).map((t: any) => t.id);

    const [profilesRes, subjectsRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", userIds),
      supabase.from("teacher_subjects").select("teacher_id, subject_id, subjects(name)").in("teacher_id", teacherIds),
    ]);

    const profileMap = new Map((profilesRes.data ?? []).map((p: any) => [p.user_id, p]));
    const subjectMap = new Map<string, any[]>();
    for (const ts of (subjectsRes.data ?? [])) {
      if (!subjectMap.has(ts.teacher_id)) subjectMap.set(ts.teacher_id, []);
      subjectMap.get(ts.teacher_id)!.push(ts);
    }

    // Filter by subject if provided
    let filtered = teachers || [];
    if (subject) {
      filtered = filtered.filter((t: any) => {
        const subs = subjectMap.get(t.id) || [];
        return subs.some((ts: any) => ts.subjects?.name === subject);
      });
    }

    // Score and rank teachers
    const scored = filtered.map((t: any) => {
      let score = 0;
      score += (t.avg_rating || 0) * 20;
      score += Math.min((t.total_sessions || 0) / 10, 30);
      score += Math.min((t.total_reviews || 0) / 5, 20);
      score += (t.years_experience || 0) * 2;

      const profile = profileMap.get(t.user_id);
      const subs = subjectMap.get(t.id) || [];
      
      return {
        id: t.id,
        user_id: t.user_id,
        name: profile?.full_name || "مدرس",
        avatar_url: profile?.avatar_url,
        subject: subs[0]?.subjects?.name || subject || "عام",
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
