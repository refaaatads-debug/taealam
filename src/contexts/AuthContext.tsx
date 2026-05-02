import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { triggerSessionConflict } from "@/components/SessionConflictDialog";

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

// Cache keys + helpers (per-user) to make subsequent loads instant
const CACHE_VERSION = "v1";
const profileCacheKey = (uid: string) => `auth_cache_${CACHE_VERSION}_profile_${uid}`;
const rolesCacheKey = (uid: string) => `auth_cache_${CACHE_VERSION}_roles_${uid}`;
const lastUserKey = `auth_cache_${CACHE_VERSION}_last_user`;

const readCache = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const writeCache = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore quota */ }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // Hydrate from cache for the last known user → instant first paint
  const cachedUserId = typeof window !== "undefined" ? localStorage.getItem(lastUserKey) : null;
  const cachedProfile = cachedUserId ? readCache<AuthContextType["profile"]>(profileCacheKey(cachedUserId)) : null;
  const cachedRoles = cachedUserId ? readCache<AppRole[]>(rolesCacheKey(cachedUserId)) : null;

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(cachedProfile);
  const [roles, setRoles] = useState<AppRole[]>(cachedRoles ?? []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, phone")
      .eq("user_id", userId)
      .single();
    if (data) {
      setProfile(data);
      writeCache(profileCacheKey(userId), data);
    }
    return data ?? null;
  };

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const list = (data ?? []).map((r) => r.role);
    if (data) {
      setRoles(list);
      writeCache(rolesCacheKey(userId), list);
    }
    return list;
  };

  const getPrimaryRole = (list: AppRole[]) => {
    if (list.includes("admin" as AppRole)) return "admin";
    if (list.includes("teacher" as AppRole)) return "teacher";
    return "student";
  };

  const redirectAuthenticatedUser = (list: AppRole[]) => {
    const path = window.location.pathname;
    if (path !== "/" && path !== "/login") return;

    const pendingRole = localStorage.getItem("pending_role");
    if (pendingRole === "teacher") return;

    const primaryRole = getPrimaryRole(list);
    const target = primaryRole === "admin" ? "/admin" : primaryRole === "teacher" ? "/teacher" : "/student";

    if (path !== target) {
      window.location.replace(target);
    }
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
          window.location.replace("/teacher");
          return;
        }
        console.log("Role update skipped:", error.message);
      } catch (e) {
        console.error("Error setting role:", e);
      }
    }
  };

  // Single-session enforcement: stable token per browser/device (localStorage)
  const getSessionToken = () => {
    let token = localStorage.getItem("session_token");
    if (!token) {
      // Migrate from sessionStorage if exists
      const old = sessionStorage.getItem("session_token");
      token = old || crypto.randomUUID();
      localStorage.setItem("session_token", token);
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

  // Threshold for considering an "other" session truly active.
  // Heartbeat is every 30s; we allow 1 missed beat + buffer = 75s before we treat it as stale.
  const STALE_THRESHOLD_MS = 75_000;

  const checkSessionStillActive = async (userId: string) => {
    const token = getSessionToken();
    const { data } = await supabase
      .from("user_active_session")
      .select("session_token, last_seen")
      .eq("user_id", userId)
      .maybeSingle();
    // If no row exists or token matches → we own the session
    if (!data || data.session_token === token) {
      // Refresh our claim to keep last_seen fresh
      await claimActiveSession(userId);
      return true;
    }
    // Different token — only show conflict if the OTHER session has a fresh heartbeat
    const lastSeen = data.last_seen ? new Date(data.last_seen).getTime() : 0;
    const ageMs = Date.now() - lastSeen;
    if (ageMs > STALE_THRESHOLD_MS) {
      // Stale (other device hasn't heartbeated recently) — silently take over
      await claimActiveSession(userId);
      return true;
    }
    // Cooldown after a manual take-over (avoid loop with realtime echo)
    const takeoverAt = (window as any).__sessionTakeoverAt || 0;
    if (Date.now() - takeoverAt < 15000) {
      await claimActiveSession(userId);
      return true;
    }
    // Re-verify once after a short delay to avoid false positives from
    // racing heartbeats / realtime echoes (the other tab may be us mid-refresh).
    await new Promise((r) => setTimeout(r, 1500));
    const { data: recheck } = await supabase
      .from("user_active_session")
      .select("session_token, last_seen")
      .eq("user_id", userId)
      .maybeSingle();
    if (!recheck || recheck.session_token === token) {
      await claimActiveSession(userId);
      return true;
    }
    const recheckAge = recheck.last_seen
      ? Date.now() - new Date(recheck.last_seen).getTime()
      : Infinity;
    if (recheckAge > STALE_THRESHOLD_MS) {
      await claimActiveSession(userId);
      return true;
    }
    triggerSessionConflict({ userId, myToken: token });
    return false;
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
            // Ignore self-updates and matching tokens
            if (!newToken || newToken === myToken) return;
            // Double-check via DB to avoid false positives
            checkSessionStillActive(userId);
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

    const initializeAuthenticatedSession = async (userId: string) => {
      // Remember last user for cache hydration on next visit
      try { localStorage.setItem(lastUserKey, userId); } catch { /* ignore */ }

      // Release loading immediately — UI shouldn't block on background work
      setLoading(false);

      try {
        // Run all background tasks in parallel; don't let any one block the UI
        await Promise.allSettled([
          claimActiveSession(userId),
          fetchProfile(userId),
          fetchRoles(userId),
        ]);
        await applyPendingRole(userId).catch(() => {});
        cleanupSingleSession();
        setupSingleSession(userId);
      } catch (e) {
        console.error("Error loading user data:", e);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // Small delay to ensure DB triggers have completed
          setTimeout(() => {
            void initializeAuthenticatedSession(session.user.id);
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
        await initializeAuthenticatedSession(session.user.id);
      } else {
        cleanupSingleSession();
        setProfile(null);
        setRoles([]);
        setLoading(false);
      }
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
    // Clear caches for the user before sign-out
    try {
      const uid = user?.id ?? localStorage.getItem(lastUserKey);
      if (uid) {
        localStorage.removeItem(profileCacheKey(uid));
        localStorage.removeItem(rolesCacheKey(uid));
      }
      localStorage.removeItem(lastUserKey);
    } catch { /* ignore */ }
    await supabase.auth.signOut();
    sessionStorage.removeItem("session_token");
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
