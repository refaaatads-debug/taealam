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

  // Single-session enforcement: generate a unique token per browser tab
  const getSessionToken = () => {
    let token = sessionStorage.getItem("session_token");
    if (!token) {
      token = crypto.randomUUID();
      sessionStorage.setItem("session_token", token);
    }
    return token;
  };

  const claimActiveSession = async (userId: string) => {
    const token = getSessionToken();
    const deviceInfo = `${navigator.platform} - ${navigator.userAgent.substring(0, 100)}`;
    await supabase
      .from("user_active_session")
      .upsert({ user_id: userId, session_token: token, device_info: deviceInfo, last_seen: new Date().toISOString() });
  };

  const checkSessionStillActive = async (userId: string) => {
    const token = getSessionToken();
    const { data } = await supabase
      .from("user_active_session")
      .select("session_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (data && data.session_token !== token) {
      // Another device took over
      await supabase.auth.signOut();
      sessionStorage.removeItem("session_token");
      alert("تم تسجيل الدخول من جهاز آخر. سيتم تسجيل خروجك من هذا الجهاز.");
      window.location.href = "/login";
      return false;
    }
    return true;
  };

  useEffect(() => {
    // Safety timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    const setupSingleSession = (userId: string) => {
      // Subscribe to changes on this user's active session
      realtimeChannel = supabase
        .channel(`active-session-${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_active_session", filter: `user_id=eq.${userId}` },
          (payload: any) => {
            const newToken = payload.new?.session_token;
            const myToken = getSessionToken();
            if (newToken && newToken !== myToken) {
              supabase.auth.signOut().then(() => {
                sessionStorage.removeItem("session_token");
                alert("تم تسجيل الدخول من جهاز آخر. سيتم تسجيل خروجك من هذا الجهاز.");
                window.location.href = "/login";
              });
            }
          }
        )
        .subscribe();

      // Heartbeat every 30s to refresh last_seen and verify ownership
      heartbeatInterval = setInterval(() => {
        checkSessionStillActive(userId);
      }, 30000);
    };

    const cleanupSingleSession = () => {
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // Small delay to ensure DB triggers have completed
          setTimeout(async () => {
            try {
              await claimActiveSession(session.user.id);
              await fetchProfile(session.user.id);
              await fetchRoles(session.user.id);
              await applyPendingRole(session.user.id);
              cleanupSingleSession();
              setupSingleSession(session.user.id);
            } catch (e) {
              console.error("Error loading user data:", e);
            } finally {
              setLoading(false);
            }
          }, 500);
        } else {
          cleanupSingleSession();
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
          // On reload, verify we still own the session
          const stillActive = await checkSessionStillActive(session.user.id);
          if (stillActive) {
            await fetchProfile(session.user.id);
            await fetchRoles(session.user.id);
            await applyPendingRole(session.user.id);
            setupSingleSession(session.user.id);
          }
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
      cleanupSingleSession();
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
  };

  const refreshProfile = async () => {
    if (user?.id) await fetchProfile(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, profile, roles, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
