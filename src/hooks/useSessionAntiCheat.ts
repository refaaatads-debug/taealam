import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const HEARTBEAT_INTERVAL = 10_000; // 10 seconds
const DISCONNECT_TIMEOUT = 60_000; // 60 seconds grace period
const TAB_LOCK_KEY = "session_tab_lock_";

function generateDeviceId(): string {
  let deviceId = localStorage.getItem("device_id");
  if (!deviceId) {
    deviceId = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem("device_id", deviceId);
  }
  return deviceId;
}

interface UseSessionAntiCheatOptions {
  bookingId: string;
  userId: string;
  enabled: boolean; // only active when meeting started
  onForceEnd?: () => void;
}

export function useSessionAntiCheat({
  bookingId,
  userId,
  enabled,
  onForceEnd,
}: UseSessionAntiCheatOptions) {
  const [isTabLocked, setIsTabLocked] = useState(false);
  const [isDeviceConflict, setIsDeviceConflict] = useState(false);
  const [peerDisconnected, setPeerDisconnected] = useState(false);
  const [reconnectCountdown, setReconnectCountdown] = useState(0);

  const heartbeatRef = useRef<number>();
  const disconnectTimerRef = useRef<number>();
  const countdownRef = useRef<number>();
  const deviceId = useRef(generateDeviceId());
  const tabId = useRef(`tab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);

  // ─── Log Event ───
  const logEvent = useCallback(async (eventType: string, metadata?: Record<string, any>) => {
    if (!userId) return;
    try {
      await supabase.from("session_events" as any).insert({
        user_id: userId,
        booking_id: bookingId || null,
        event_type: eventType,
        device_id: deviceId.current,
        metadata: metadata || {},
      } as any);
    } catch (e) {
      console.error("Failed to log event:", e);
    }
  }, [userId, bookingId]);

  // ─── Tab Lock (prevent same session in multiple tabs) ───
  useEffect(() => {
    if (!enabled || !bookingId) return;

    const lockKey = TAB_LOCK_KEY + bookingId;
    const lockTimestampKey = lockKey + "_ts";
    const existingLock = localStorage.getItem(lockKey);
    const existingTs = localStorage.getItem(lockTimestampKey);

    // If lock exists from another tab, check if it's stale (>30s old)
    if (existingLock && existingLock !== tabId.current) {
      const lockAge = existingTs ? Date.now() - parseInt(existingTs, 10) : Infinity;
      if (lockAge < 30_000) {
        setIsTabLocked(true);
        toast.error("هذه الجلسة مفتوحة في تبويب آخر. أغلق التبويب الآخر أولاً.", { duration: 10000 });
        return;
      }
      console.log("Tab lock was stale, taking over");
    }

    // Acquire lock with timestamp
    localStorage.setItem(lockKey, tabId.current);
    localStorage.setItem(lockTimestampKey, Date.now().toString());

    // Keep timestamp fresh every 10s
    const refreshInterval = window.setInterval(() => {
      const current = localStorage.getItem(lockKey);
      if (current === tabId.current) {
        localStorage.setItem(lockTimestampKey, Date.now().toString());
      }
    }, 10_000);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === lockKey && e.newValue && e.newValue !== tabId.current) {
        setIsTabLocked(true);
        toast.error("تم فتح الجلسة في تبويب آخر. هذا التبويب سيتم تعطيله.");
      }
    };

    window.addEventListener("storage", handleStorage);

    const handleUnload = () => {
      const current = localStorage.getItem(lockKey);
      if (current === tabId.current) {
        localStorage.removeItem(lockKey);
        localStorage.removeItem(lockTimestampKey);
      }
      logEvent("tab_close", { tab_id: tabId.current });
    };

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(refreshInterval);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("beforeunload", handleUnload);
      const current = localStorage.getItem(lockKey);
      if (current === tabId.current) {
        localStorage.removeItem(lockKey);
        localStorage.removeItem(lockTimestampKey);
      }
    };
  }, [enabled, bookingId]);

  // ─── Device Session Tracking (prevent multi-device) ───
  const registerSession = useCallback(async () => {
    if (!userId || !bookingId) return;

    try {
      // Check for existing active session from another device
      const { data: existing } = await supabase
        .from("active_sessions" as any)
        .select("*")
        .eq("user_id", userId)
        .eq("booking_id", bookingId)
        .eq("is_connected", true)
        .maybeSingle() as any;

      if (existing && existing.device_id !== deviceId.current) {
        // Another device has this session - take over
        await supabase
          .from("active_sessions" as any)
          .update({ is_connected: false, disconnected_at: new Date().toISOString() } as any)
          .eq("id", existing.id);

        logEvent("device_takeover", {
          old_device: existing.device_id,
          new_device: deviceId.current,
        });

        toast.warning("تم إنهاء الجلسة على الجهاز الآخر والانتقال لهذا الجهاز.");
      }

      // Upsert our session
      await supabase
        .from("active_sessions" as any)
        .upsert({
          user_id: userId,
          booking_id: bookingId,
          device_id: deviceId.current,
          is_connected: true,
          last_heartbeat: new Date().toISOString(),
          disconnected_at: null,
        } as any, { onConflict: "user_id,booking_id" });

      logEvent("join_session", { device_id: deviceId.current });
    } catch (e) {
      console.error("Failed to register session:", e);
    }
  }, [userId, bookingId, logEvent]);

  // ─── Heartbeat System ───
  useEffect(() => {
    if (!enabled || !userId || !bookingId || isTabLocked) return;

    // Register on start
    registerSession();

    // Send heartbeat every 10s
    heartbeatRef.current = window.setInterval(async () => {
      try {
        await supabase
          .from("active_sessions" as any)
          .update({
            last_heartbeat: new Date().toISOString(),
            is_connected: true,
          } as any)
          .eq("user_id", userId)
          .eq("booking_id", bookingId);
      } catch (e) {
        console.error("Heartbeat failed:", e);
      }
    }, HEARTBEAT_INTERVAL);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [enabled, userId, bookingId, isTabLocked, registerSession]);

  // ─── Monitor Peer Connection (check other participant's heartbeat) ───
  useEffect(() => {
    if (!enabled || !bookingId || !userId) return;

    const checkPeer = async () => {
      try {
        // Get the other participant's active session
        const { data: peerSessions } = await supabase
          .from("active_sessions" as any)
          .select("*")
          .eq("booking_id", bookingId)
          .neq("user_id", userId) as any;

        if (!peerSessions || peerSessions.length === 0) return;

        const peer = peerSessions[0];
        const lastBeat = new Date(peer.last_heartbeat).getTime();
        const now = Date.now();
        const elapsed = now - lastBeat;

        if (elapsed > 30_000 && peer.is_connected) {
          // Peer might be disconnected
          if (!peerDisconnected) {
            setPeerDisconnected(true);
            setReconnectCountdown(60);
            logEvent("peer_disconnect_detected", { peer_user_id: peer.user_id });
            toast.warning("⚠️ انقطع اتصال المشارك الآخر. مهلة 60 ثانية لإعادة الاتصال...", { duration: 8000 });

            // Start countdown
            countdownRef.current = window.setInterval(() => {
              setReconnectCountdown(prev => {
                if (prev <= 1) {
                  clearInterval(countdownRef.current);
                  toast.error("انتهت مهلة إعادة الاتصال. سيتم إنهاء الجلسة.");
                  logEvent("session_timeout", { reason: "peer_disconnect_timeout" });
                  onForceEnd?.();
                  return 0;
                }
                return prev - 1;
              });
            }, 1000);
          }
        } else if (elapsed < 15_000 && peerDisconnected) {
          // Peer reconnected
          setPeerDisconnected(false);
          setReconnectCountdown(0);
          if (countdownRef.current) clearInterval(countdownRef.current);
          toast.success("عاد المشارك الآخر! ✅");
          logEvent("peer_reconnected", { peer_user_id: peer.user_id });
        }
      } catch (e) {
        console.error("Peer check failed:", e);
      }
    };

    const peerCheckInterval = window.setInterval(checkPeer, 10_000);
    return () => {
      clearInterval(peerCheckInterval);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [enabled, bookingId, userId, peerDisconnected, onForceEnd, logEvent]);

  // ─── Cleanup on session end ───
  const cleanupSession = useCallback(async () => {
    if (!userId || !bookingId) return;

    try {
      await supabase
        .from("active_sessions" as any)
        .update({
          is_connected: false,
          disconnected_at: new Date().toISOString(),
        } as any)
        .eq("user_id", userId)
        .eq("booking_id", bookingId);

      logEvent("leave_session", { device_id: deviceId.current });
    } catch (e) {
      console.error("Cleanup failed:", e);
    }

    // Release tab lock
    const lockKey = TAB_LOCK_KEY + bookingId;
    const current = localStorage.getItem(lockKey);
    if (current === tabId.current) {
      localStorage.removeItem(lockKey);
    }
  }, [userId, bookingId, logEvent]);

  // ─── Check if user already has another active session ───
  const checkActiveSession = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;

    try {
      const { data: activeSessions } = await supabase
        .from("active_sessions" as any)
        .select("*")
        .eq("user_id", userId)
        .eq("is_connected", true) as any;

      if (activeSessions && activeSessions.length > 0) {
        const now = Date.now();
        // Only consider sessions with a recent heartbeat (< 30s) as truly active
        const trulyActive = activeSessions.filter((s: any) => {
          const lastBeat = new Date(s.last_heartbeat).getTime();
          return (now - lastBeat) < 30_000;
        });

        // Auto-cleanup stale sessions
        const stale = activeSessions.filter((s: any) => {
          const lastBeat = new Date(s.last_heartbeat).getTime();
          return (now - lastBeat) >= 30_000;
        });
        for (const s of stale) {
          supabase
            .from("active_sessions" as any)
            .update({ is_connected: false, disconnected_at: new Date().toISOString() } as any)
            .eq("id", s.id)
            .then(() => {});
        }

        const other = trulyActive.find((s: any) => s.booking_id !== bookingId);
        if (other) {
          toast.error("لديك جلسة نشطة أخرى. أنهِها أولاً قبل الانضمام لجلسة جديدة.", { duration: 8000 });
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }, [userId, bookingId]);

  return {
    isTabLocked,
    isDeviceConflict,
    peerDisconnected,
    reconnectCountdown,
    cleanupSession,
    checkActiveSession,
    logEvent,
  };
}
