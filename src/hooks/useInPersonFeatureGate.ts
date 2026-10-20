import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export function useInPersonFeatureGate() {
  const { user } = useAuth();
  const userId = user?.id;
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(Boolean(userId));

  useEffect(() => {
    let active = true;

    if (!userId) {
      setEnabled(false);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setEnabled(false);
    setLoading(true);
    supabase.rpc("is_in_person_test_user")
      .then(({ data, error }) => {
        if (!active) return;
        setEnabled(!error && data === true);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setEnabled(false);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  return { enabled, loading };
}
