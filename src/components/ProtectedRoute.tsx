import { Navigate, useLocation } from "react-router-dom";
import BrandLoader from "@/components/BrandLoader";
import TeacherApprovalBlocked from "@/components/TeacherApprovalBlocked";
import AccountDeletedBlocked from "@/components/AccountDeletedBlocked";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, roles } = useAuth();
  const location = useLocation();
  const [isBanned, setIsBanned] = useState(false);
  const [banChecked, setBanChecked] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [teacherApprovalStatus, setTeacherApprovalStatus] = useState<string | null>(null);
  const [teacherStatusChecked, setTeacherStatusChecked] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user) {
      setBanChecked(true);
      setTeacherStatusChecked(true);
      return () => { active = false; };
    }

    const isAdmin = roles.includes("admin");
    const isTeacher = roles.includes("teacher");
    if (isAdmin) {
      setBanChecked(true);
      setTeacherStatusChecked(true);
      setTeacherApprovalStatus(null);
      setIsDeleted(false);
      return () => { active = false; };
    }

    setBanChecked(false);
    setTeacherStatusChecked(false);
    void (async () => {
      try {
        const [{ data: warnings }, { data: accountProfile }, { data: teacherProfile }] = await Promise.all([
          supabase
            .from("user_warnings")
            .select("is_banned")
            .eq("user_id", user.id)
            .eq("is_banned", true)
            .limit(1),
          supabase
            .from("profiles")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle(),
          isTeacher
            ? supabase
                .from("teacher_profiles")
                .select("*")
                .eq("user_id", user.id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        if (!active) return;
        setIsBanned((warnings ?? []).length > 0);
        setIsDeleted(Boolean((accountProfile as any)?.is_deleted));
        const profile = teacherProfile as any;
        setTeacherApprovalStatus(profile?.approval_status ?? (profile?.is_approved ? "approved" : "pending"));
      } catch {
        if (!active) return;
        setIsBanned(false);
        setIsDeleted(false);
        setTeacherApprovalStatus(null);
      } finally {
        if (active) {
          setBanChecked(true);
          setTeacherStatusChecked(true);
        }
      }
    })();

    return () => { active = false; };
  }, [user, roles, location.pathname]);

  if (loading || !banChecked || (roles.includes("teacher") && !roles.includes("admin") && !teacherStatusChecked)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <BrandLoader />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (isDeleted && location.pathname !== "/support") {
    return <AccountDeletedBlocked />;
  }

  if (teacherApprovalStatus === "rejected" && location.pathname !== "/support") {
    return <TeacherApprovalBlocked />;
  }

  if (isBanned && location.pathname !== "/support") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4" dir="rtl">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-card p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-xl font-black text-foreground">تم تقييد حسابك</h1>
          <p className="text-muted-foreground text-sm">
            تم تقييد حسابك من قبل الإدارة. يرجى مراجعة خدمة العملاء لحل الأمر.
          </p>
          <Button variant="outline" className="rounded-xl" onClick={() => window.location.href = "/support"}>
            تواصل مع خدمة العملاء
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
