import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, roles } = useAuth();
  const [isBanned, setIsBanned] = useState(false);
  const [banChecked, setBanChecked] = useState(false);

  useEffect(() => {
    if (!user) { setBanChecked(true); return; }
    // Admins are never banned
    if (roles.includes("admin")) { setBanChecked(true); return; }
    
    supabase
      .from("user_warnings")
      .select("is_banned")
      .eq("user_id", user.id)
      .eq("is_banned", true)
      .limit(1)
      .then(({ data }) => {
        setIsBanned((data ?? []).length > 0);
        setBanChecked(true);
      });
  }, [user, roles]);

  if (loading || !banChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (isBanned) {
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
