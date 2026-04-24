import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, CheckCircle, Users, Loader2, ChevronDown, ChevronUp, Calendar as CalendarIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import CountdownTimer from "@/components/CountdownTimer";
import FirstImpressionDialog from "@/components/teacher/FirstImpressionDialog";

interface BookingRequest {
  id: string;
  student_id: string;
  subject_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  expires_at: string;
  group_id?: string | null;
  student_name?: string;
  subject_name?: string;
}

interface RequestGroup {
  key: string;          // group_id or single id
  group_id: string | null;
  student_id: string;
  student_name: string;
  subject_name: string;
  items: BookingRequest[];
  earliest_expires_at: string;
}

export default function BookingRequests() {
  const { user, profile } = useAuth();
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [expiredKeys, setExpiredKeys] = useState<Set<string>>(new Set());
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [impressionFor, setImpressionFor] = useState<string | null>(null);
  const { play: playSound } = useNotificationSound();
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (!user) return;
    fetchRequests();

    const channel = supabase
      .channel("teacher-booking-requests")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "booking_requests" }, () => {
        playSound("booking");
        fetchRequests();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "booking_requests" }, () => {
        fetchRequests();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const fetchRequests = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("booking_requests" as any)
      .select("*")
      .eq("status", "open")
      .order("scheduled_at", { ascending: true });

    if (!data || data.length === 0) { setRequests([]); return; }

    const now = Date.now();
    const validData = (data as any[]).filter((r: any) => {
      if (!r.expires_at) return true;
      return new Date(r.expires_at).getTime() > now;
    });

    if (validData.length === 0) { setRequests([]); return; }

    const studentIds = [...new Set(validData.map((r: any) => r.student_id))];
    const subjectIds = [...new Set(validData.map((r: any) => r.subject_id).filter(Boolean))];

    const [{ data: profiles }, { data: subjects }] = await Promise.all([
      supabase.from("public_profiles").select("user_id, full_name").in("user_id", studentIds),
      subjectIds.length > 0 ? supabase.from("subjects").select("id, name").in("id", subjectIds) : { data: [] },
    ]);

    const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));
    const subjectMap = new Map((subjects ?? []).map(s => [s.id, s.name]));

    setRequests(validData.map((r: any) => ({
      ...r,
      student_name: profileMap.get(r.student_id) || "طالب",
      subject_name: subjectMap.get(r.subject_id) || "مادة",
    })));
  };

  // Build groups: rows sharing a non-null group_id are grouped; else singletons
  const buildGroups = (): RequestGroup[] => {
    const groups = new Map<string, RequestGroup>();
    for (const r of requests) {
      const key = r.group_id || r.id;
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(r);
        if (new Date(r.expires_at).getTime() < new Date(existing.earliest_expires_at).getTime()) {
          existing.earliest_expires_at = r.expires_at;
        }
      } else {
        groups.set(key, {
          key,
          group_id: r.group_id || null,
          student_id: r.student_id,
          student_name: r.student_name || "طالب",
          subject_name: r.subject_name || "مادة",
          items: [r],
          earliest_expires_at: r.expires_at,
        });
      }
    }
    // Sort items inside each group by date
    for (const g of groups.values()) {
      g.items.sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
    }
    return Array.from(groups.values());
  };

  const handleExpire = useCallback((key: string) => {
    setExpiredKeys(prev => new Set(prev).add(key));
  }, []);

  // Check if booking conflicts with existing teacher schedule
  const hasConflict = async (scheduled_at: string, duration_minutes: number): Promise<boolean> => {
    if (!user) return false;
    const start = new Date(scheduled_at).getTime();
    const end = start + (duration_minutes || 45) * 60_000;
    const { data: existingBookings } = await supabase
      .from("bookings")
      .select("id, scheduled_at, duration_minutes, status")
      .eq("teacher_id", user.id)
      .in("status", ["pending", "confirmed"])
      .gte("scheduled_at", new Date(start - 24 * 60 * 60_000).toISOString())
      .lte("scheduled_at", new Date(end + 24 * 60 * 60_000).toISOString());
    if (!existingBookings) return false;
    return existingBookings.some(b => {
      const bStart = new Date(b.scheduled_at).getTime();
      const bEnd = bStart + (b.duration_minutes || 45) * 60_000;
      return start < bEnd && end > bStart;
    });
  };

  // Show first-impression once per student on the WHOLE platform.
  // Only triggers when the student has never had any prior booking with any teacher.
  // Persisted in DB so refreshes / re-accepts never re-show it.
  const maybeShowFirstImpression = async (studentId: string, studentName: string, justCreatedBookingIds: string[] = []) => {
    if (!user) return;

    // 1) Check if any teacher has already shown the first-impression for this student before
    const { data: existing } = await supabase
      .from("teacher_first_impressions" as any)
      .select("id")
      .eq("student_id", studentId)
      .limit(1)
      .maybeSingle();
    if (existing) return;

    // 2) Check whether the student has any PRIOR booking on the platform (excluding the ones we just created)
    let priorQuery = supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId);
    if (justCreatedBookingIds.length > 0) {
      priorQuery = priorQuery.not("id", "in", `(${justCreatedBookingIds.join(",")})`);
    }
    const { count: priorBookings } = await priorQuery;
    if ((priorBookings || 0) > 0) return; // not their first time on the platform

    // 3) Atomically claim the first-impression slot
    const { error } = await supabase
      .from("teacher_first_impressions" as any)
      .insert({ teacher_id: user.id, student_id: studentId } as any);
    if (!error) setImpressionFor(studentName);
  };

  const handleAcceptGroup = async (group: RequestGroup) => {
    if (!user) return;
    if (new Date(group.earliest_expires_at).getTime() <= Date.now()) {
      toast.info("انتهت صلاحية هذا الطلب");
      fetchRequests();
      return;
    }

    // Conflict check for ALL slots in the group
    for (const r of group.items) {
      if (await hasConflict(r.scheduled_at, r.duration_minutes)) {
        toast.error(`لديك حصة محجوزة بنفس وقت ${new Date(r.scheduled_at).toLocaleString("ar-SA")}. لا يمكن قبول هذا الطلب.`);
        return;
      }
    }

    setAccepting(group.key);
    try {
      let acceptedRequests: BookingRequest[] = [];

      if (group.group_id) {
        // Atomic group accept
        const { data, error } = await supabase.rpc("accept_booking_group" as any, {
          _group_id: group.group_id,
          _teacher_id: user.id,
        });
        if (error) throw error;
        acceptedRequests = (data as any[]) || [];
        if (acceptedRequests.length === 0) {
          toast.info("تم قبول هذا الطلب من معلم آخر بالفعل");
          fetchRequests();
          setAccepting(null);
          return;
        }
      } else {
        // Single request accept (legacy)
        const r = group.items[0];
        const { data: ok, error } = await supabase.rpc("accept_booking_request" as any, {
          _request_id: r.id,
          _teacher_id: user.id,
        });
        if (error) throw error;
        if (!ok) {
          toast.info("تم قبول هذا الطلب من معلم آخر بالفعل");
          fetchRequests();
          setAccepting(null);
          return;
        }
        acceptedRequests = [r];
      }

      // Get active subscription
      const { data: activeSub } = await supabase
        .from("user_subscriptions")
        .select("id")
        .eq("user_id", group.student_id)
        .eq("is_active", true)
        .gt("sessions_remaining", 0)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Bulk insert bookings
      const bookingsPayload = acceptedRequests.map(r => ({
        student_id: r.student_id,
        teacher_id: user.id,
        subject_id: r.subject_id,
        scheduled_at: r.scheduled_at,
        duration_minutes: r.duration_minutes,
        status: "confirmed" as const,
        used_subscription: !!activeSub,
        subscription_id: activeSub?.id || null,
      }));

      const { data: createdBookings, error: bookingError } = await supabase
        .from("bookings")
        .insert(bookingsPayload)
        .select("id");

      if (bookingError) throw bookingError;

      // Notify student once for the whole group
      const count = acceptedRequests.length;
      await supabase.from("notifications").insert({
        user_id: group.student_id,
        title: count > 1 ? `تم قبول ${count} حصص! ✅` : "تم قبول طلبك! ✅",
        body:
          count > 1
            ? `قبل المعلم ${profile?.full_name || "معلم"} جميع حصصك في ${group.subject_name}. تحقق من الجدول.`
            : `قبل المعلم ${profile?.full_name || "معلم"} طلب حصتك في ${group.subject_name}. جهّز نفسك!`,
        type: "booking",
      });

      // Welcome chat on first booking only
      if (createdBookings && createdBookings[0]) {
        await supabase.from("chat_messages").insert({
          booking_id: createdBookings[0].id,
          sender_id: user.id,
          content: `مرحباً! أنا ${profile?.full_name || "معلمك"} وقبلت ${count > 1 ? `${count} حصص` : "طلب حصتك"} 🎉`,
        });
      }

      toast.success(count > 1 ? `تم قبول ${count} حصص بنجاح! 🎉` : "تم قبول الطلب بنجاح! 🎉");

      // First-impression dialog (DB-deduped)
      await maybeShowFirstImpression(group.student_id, group.student_name);

      fetchRequests();
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
      fetchRequests();
    } finally {
      setAccepting(null);
    }
  };

  const groups = buildGroups().filter(g => !expiredKeys.has(g.key));

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <CalendarCheck className="h-4 w-4 text-primary" />
          </div>
          طلبات الحصص المتاحة
          {groups.length > 0 && (
            <Badge className="mr-auto bg-destructive/10 text-destructive border-0 text-xs">
              {groups.length} طلب
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">لا توجد طلبات حصص جديدة</p>
        ) : (
          groups.map((g) => {
            const isMulti = g.items.length > 1;
            const isExpanded = expandedKey === g.key;
            const firstSlot = g.items[0];
            return (
              <motion.div
                key={g.key}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="rounded-xl bg-muted/50 hover:bg-muted transition-colors overflow-hidden"
              >
                <div className="flex items-start justify-between p-4 gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center border shrink-0">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-foreground flex items-center gap-1.5 flex-wrap">
                        {g.student_name}
                        {isMulti && (
                          <button
                            onClick={() => setExpandedKey(isExpanded ? null : g.key)}
                            className="inline-flex items-center"
                          >
                            <Badge className="bg-primary/15 text-primary border-0 text-[10px] h-5 gap-1 cursor-pointer hover:bg-primary/25">
                              📚 {g.items.length} حصص في طلب واحد
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </Badge>
                          </button>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {g.subject_name} •{" "}
                        {new Date(firstSlot.scheduled_at).toLocaleDateString("ar-SA")} •{" "}
                        {new Date(firstSlot.scheduled_at).toLocaleTimeString("ar-SA", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {isMulti && ` (+${g.items.length - 1} موعد آخر)`}
                      </p>
                      <p className="text-xs text-muted-foreground">{firstSlot.duration_minutes} دقيقة لكل حصة</p>
                      {g.earliest_expires_at && (
                        <div className="mt-1.5">
                          <CountdownTimer
                            expiresAt={g.earliest_expires_at}
                            onExpire={() => handleExpire(g.key)}
                            showLabel
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="gradient-cta text-secondary-foreground rounded-xl shadow-button gap-1.5 shrink-0"
                    onClick={() => handleAcceptGroup(g)}
                    disabled={accepting === g.key || expiredKeys.has(g.key)}
                  >
                    {accepting === g.key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    {isMulti ? `اقبل ${g.items.length} حصص` : "اقبل الطلب"}
                  </Button>
                </div>

                <AnimatePresence>
                  {isMulti && isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-border/40 bg-background/40 overflow-hidden"
                    >
                      <ul className="divide-y divide-border/40">
                        {g.items.map((it, idx) => (
                          <li key={it.id} className="flex items-center gap-2 px-4 py-2 text-xs">
                            <CalendarIcon className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                            <span className="font-bold text-foreground">#{idx + 1}</span>
                            <span className="text-foreground">
                              {new Date(it.scheduled_at).toLocaleDateString("ar-SA", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                            <span className="text-muted-foreground">
                              {new Date(it.scheduled_at).toLocaleTimeString("ar-SA", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            <span className="mr-auto text-muted-foreground">{it.duration_minutes} د</span>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </CardContent>

      <FirstImpressionDialog
        open={!!impressionFor}
        onOpenChange={(v) => !v && setImpressionFor(null)}
        studentName={impressionFor || undefined}
      />
    </Card>
  );
}
