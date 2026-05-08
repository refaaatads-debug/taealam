import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const LOOKAHEAD_DAYS = 14;
const DEFAULT_SESSION_MINUTES = 45;

export interface StudentSubscription {
  id: string;
  remaining_minutes: number;
  sessions_remaining: number;
  total_hours: number;
  is_active: boolean;
  ends_at: string;
  plan_id: string;
  subscription_plans?: {
    name_ar: string;
    tier: string;
    sessions_count: number;
  };
  [key: string]: any;
}

export interface UseStudentBalanceResult {
  baseMinutes: number;
  reservedMinutes: number;
  availableMinutes: number;
  subscriptions: StudentSubscription[];
  aggregated: {
    remaining_minutes: number;
    total_hours: number;
    sessions_remaining: number;
    ends_at: string | null;
    plan_name: string;
    tier: string;
  } | null;
  existingBookingDates: Date[];
  loading: boolean;
  refetch: () => void;
}

export function useStudentBalance(): UseStudentBalanceResult {
  const { user } = useAuth();
  const [baseMinutes, setBaseMinutes] = useState(0);
  const [reservedMinutes, setReservedMinutes] = useState(0);
  const [subscriptions, setSubscriptions] = useState<StudentSubscription[]>([]);
  const [existingBookingDates, setExistingBookingDates] = useState<Date[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const now = new Date().toISOString();
    const future = new Date(Date.now() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000).toISOString();

    Promise.all([
      supabase
        .from("user_subscriptions")
        .select("*, subscription_plans(name_ar, tier, sessions_count)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .gt("remaining_minutes", 0)
        .gt("ends_at", now)
        .order("ends_at", { ascending: true }),
      supabase
        .from("bookings")
        .select("scheduled_at, duration_minutes")
        .eq("student_id", user.id)
        .in("status", ["pending", "confirmed"])
        .gte("scheduled_at", now)
        .lte("scheduled_at", future),
      supabase
        .from("booking_requests")
        .select("scheduled_at, duration_minutes")
        .eq("student_id", user.id)
        .in("status", ["open", "accepted"])
        .gte("scheduled_at", now)
        .lte("scheduled_at", future),
    ]).then(([subsRes, bookingsRes, requestsRes]) => {
      const subs = (subsRes.data || []) as StudentSubscription[];
      const base = subs.reduce((s, x) => s + (x.remaining_minutes || 0), 0);
      setSubscriptions(subs);
      setBaseMinutes(base);

      const fromBookings = (bookingsRes.data || []).reduce(
        (s: number, x: any) => s + Math.max(0, x.duration_minutes || DEFAULT_SESSION_MINUTES), 0
      );
      const fromRequests = (requestsRes.data || []).reduce(
        (s: number, x: any) => s + Math.max(0, x.duration_minutes || DEFAULT_SESSION_MINUTES), 0
      );
      setReservedMinutes(fromBookings + fromRequests);

      const dates: Date[] = [];
      (bookingsRes.data || []).forEach((x: any) => { if (x.scheduled_at) dates.push(new Date(x.scheduled_at)); });
      (requestsRes.data || []).forEach((x: any) => { if (x.scheduled_at) dates.push(new Date(x.scheduled_at)); });
      setExistingBookingDates(dates);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user, tick]);

  const availableMinutes = Math.max(0, baseMinutes - reservedMinutes);

  let aggregated: UseStudentBalanceResult["aggregated"] = null;
  if (subscriptions.length > 0) {
    const first = subscriptions[0];
    aggregated = {
      remaining_minutes: subscriptions.reduce((s, x) => s + (x.remaining_minutes || 0), 0),
      total_hours: subscriptions.reduce((s, x) => s + (x.total_hours || 0), 0),
      sessions_remaining: subscriptions.reduce((s, x) => s + (x.sessions_remaining || 0), 0),
      ends_at: first.ends_at ?? null,
      plan_name: (first.subscription_plans as any)?.name_ar ?? "",
      tier: (first.subscription_plans as any)?.tier ?? "",
    };
  }

  return { baseMinutes, reservedMinutes, availableMinutes, subscriptions, aggregated, existingBookingDates, loading, refetch };
}
