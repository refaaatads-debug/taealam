import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BrandLoader from "@/components/BrandLoader";
import RedesignedLandingPage, { LandingTeacher } from "@/components/RedesignedLandingPage";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const { user, roles, loading } = useAuth();
  const [teachers, setTeachers] = useState<LandingTeacher[]>([]);

  useEffect(() => {
    const loadFeatured = async () => {
      const { data: featured } = await supabase
        .from("featured_teachers")
        .select("teacher_id, badge_label, display_order, image_url, subject_label, price, hide_price, students_count, sessions_count, rating_override")
        .eq("is_active", true)
        .order("display_order");

      if (!featured?.length) return;

      const ids = featured.map((item: any) => item.teacher_id);
      const [profilesRes, teacherProfilesRes, subjectsRes] = await Promise.all([
        supabase.from("public_profiles").select("user_id, full_name, avatar_url").in("user_id", ids),
        supabase.from("public_teacher_profiles").select("user_id, avg_rating, total_sessions, hourly_rate").in("user_id", ids),
        supabase
          .from("teacher_subjects")
          .select("teacher_id, teacher_profiles!inner(user_id), subjects(name)")
          .in("teacher_profiles.user_id", ids),
      ]);

      const profileMap = new Map((profilesRes.data ?? []).map((profile: any) => [profile.user_id, profile]));
      const teacherMap = new Map((teacherProfilesRes.data ?? []).map((profile: any) => [profile.user_id, profile]));
      const subjectMap = new Map<string, string>();

      (subjectsRes.data ?? []).forEach((item: any) => {
        const userId = item.teacher_profiles?.user_id;
        if (userId && !subjectMap.has(userId) && item.subjects?.name) {
          subjectMap.set(userId, item.subjects.name);
        }
      });

      setTeachers(featured.map((item: any) => {
        const profile: any = profileMap.get(item.teacher_id);
        const teacherProfile: any = teacherMap.get(item.teacher_id);
        return {
          name: profile?.full_name || "مدرس",
          subject: item.subject_label || subjectMap.get(item.teacher_id) || "متعدد",
          rating: Number(item.rating_override ?? teacherProfile?.avg_rating ?? 4.8),
          students: item.students_count ?? teacherProfile?.total_sessions ?? 100,
          price: Number(item.price ?? teacherProfile?.hourly_rate ?? 80),
          img: item.image_url || profile?.avatar_url || null,
          badge: item.badge_label || "مدرس مميز",
          sessions: item.sessions_count ?? teacherProfile?.total_sessions ?? 500,
          hidePrice: !!item.hide_price,
        };
      }));
    };

    void loadFeatured();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <BrandLoader />
      </div>
    );
  }

  if (user && roles.length > 0) {
    if (roles.includes("admin")) return <Navigate to="/admin" replace />;
    if (roles.includes("teacher")) return <Navigate to="/teacher" replace />;
    if (roles.includes("student")) return <Navigate to="/student" replace />;
  }

  return <RedesignedLandingPage user={user} teachers={teachers} />;
};

export default Index;