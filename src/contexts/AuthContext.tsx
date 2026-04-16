import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: { full_name: string; avatar_url: string | null; phone: string | null } | null;
  roles: AppRole[];
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  profile: null,
  roles: [],
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, phone")
      .eq("user_id", userId)
      .single();
    if (data) setProfile(data);
  };

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (data) setRoles(data.map((r) => r.role));
  };

  // Apply pending role after OAuth redirect (e.g. teacher signup via Google)
  const applyPendingRole = async (userId: string) => {
    const pendingRole = localStorage.getItem("pending_role");
    if (!pendingRole) return;
    localStorage.removeItem("pending_role");

    if (pendingRole === "teacher") {
      try {
        const { error } = await supabase.rpc("set_new_user_role", { _role: "teacher" });
        if (!error) {
          // Re-fetch roles after update
          await fetchRoles(userId);
          window.location.href = "/teacher";
          return;
        }
        console.log("Role update skipped:", error.message);
      } catch (e) {
        console.error("Error setting role:", e);
      }
    }
  };

  useEffect(() => {
    // Safety timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // Small delay to ensure DB triggers have completed
          setTimeout(async () => {
            try {
              await fetchProfile(session.user.id);
              await fetchRoles(session.user.id);
              await applyPendingRole(session.user.id);
            } catch (e) {
              console.error("Error loading user data:", e);
            } finally {
              setLoading(false);
            }
          }, 500);
        } else {
          setProfile(null);
          setRoles([]);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        try {
          await fetchProfile(session.user.id);
          await fetchRoles(session.user.id);
          await applyPendingRole(session.user.id);
        } catch (e) {
          console.error("Error loading user data:", e);
        }
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, profile, roles, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
