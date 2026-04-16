import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AdminAccess {
  loading: boolean;
  isFullAdmin: boolean; // role = admin (يرى كل شيء)
  permissions: Set<string>;
  can: (permission: string) => boolean;
}

export function useAdminPermissions(): AdminAccess {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isFullAdmin, setIsFullAdmin] = useState(false);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      const [{ data: roleRow }, { data: permRows }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
        (supabase as any).from("user_permissions").select("permission").eq("user_id", user.id),
      ]);
      setIsFullAdmin(!!roleRow);
      setPermissions(new Set((permRows || []).map((r: any) => r.permission)));
      setLoading(false);
    })();
  }, [user?.id]);

  const can = (permission: string) => isFullAdmin || permissions.has(permission);

  return { loading, isFullAdmin, permissions, can };
}
