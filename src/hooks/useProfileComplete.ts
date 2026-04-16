import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns whether the current student's profile is complete.
 * A profile is complete if: full_name + phone + teaching_stage are all set.
 * Only applies to students. Teachers/Admins are always considered complete.
 */
export const useProfileComplete = () => {
  const { user, roles, loading: authLoading } = useAuth();
  const [isComplete, setIsComplete] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const isStudent = roles.length === 0 || roles.includes("student");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsComplete(null);
      setLoading(false);
      return;
    }
    // Non-students don't need this check
    if (!isStudent) {
      setIsComplete(true);
      setLoading(false);
      return;
    }
    supabase
      .from("profiles")
      .select("full_name, phone, teaching_stage")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const complete = !!(data?.full_name && data?.phone && (data as any)?.teaching_stage);
        setIsComplete(complete);
        setLoading(false);
      });
  }, [user, isStudent, authLoading]);

  return { isComplete, loading: loading || authLoading, isStudent };
};
