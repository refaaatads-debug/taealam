import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarCheck, Loader2, MessageSquare, Video, ChevronDown, ChevronUp, User, PhoneCall, Trash2, Eraser, RotateCcw } from "lucide-react";
import { getHiddenBookings, hideBooking, hideAllBookings, clearHiddenBookings } from "@/lib/hiddenBookings";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { toast } from "sonner";
import { notificationTemplates } from "@/lib/notificationTemplates";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface BookingRow {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  session_status?: string | null;
  teacher_name?: string;
  subject_name?: string;
  teacher_id?: string;
  has_subscription?: boolean;
  actual_duration_minutes?: number | null;
}

export default function StudentScheduleTable() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveSessionIds, setLiveSessionIds] = useState<Set<string>>(new Set());
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null);
  const [joinRequest, setJoinRequest] = useState<{ bookingId: string; teacherName: string } | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (user?.id) setHiddenIds(getHiddenBookings(user.id));
  }, [user?.id]);
  const visibleBookings = useMemo(() => bookings.filter(b => !hiddenIds.has(b.id)), [bookings, hiddenIds]);
  const bookingIds = useMemo(() => visibleBookings.map(b => b.id), [visibleBookings]);
  const unreadCounts = useUnreadMessages(bookingIds);
  const { play: playNotificationSound } = useNotificationSound();

  // Compute total unread per teacher
  const unreadByTeacher = useMemo(() => {
    const result: Record<string, number> = {};
    visibleBookings.forEach(b => {
      const key = b.teacher_id || "unknown";
      result[key] = (result[key] || 0) + (unreadCounts[b.id] || 0);
    });
    return result;
  }, [visibleBookings, unreadCounts]);

  // Get latest booking id per teacher for chat link
  const latestBookingByTeacher = useMemo(() => {
    const result: Record<string, string> = {};
    visibleBookings.forEach(b => {
      const key = b.teacher_id || "unknown";
      if (!result[key]) result[key] = b.id;
    });
    return result;
  }, [visibleBookings]);

  const handleHideBooking = (bookingId: string) => {
    if (!user?.id) return;
    hideBooking(user.id, bookingId);
    setHiddenIds(new Set(getHiddenBookings(user.id)));
    toast.success("تم إخفاء الحصة من الجدول");
  };

  const handleClearAll = () => {
    if (!user?.id) return;
    if (!confirm("هل تريد إخفاء جميع الحصص من الجدول؟ (لن يتم حذفها من النظام)")) return;
    hideAllBookings(user.id, bookings.map(b => b.id));
    setHiddenIds(new Set(getHiddenBookings(user.id)));
    toast.success("تم إخفاء كل الحصص من الجدول");
  };

  const handleRestoreAll = () => {
    if (!user?.id) return;
    clearHiddenBookings(user.id);
    setHiddenIds(new Set());
    toast.success("تم استعادة جميع الحصص");
  };

  useEffect(() => {
    if (!user) return;
    fetchBookings();

    const channel = supabase
      .channel("student-schedule-table")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `student_id=eq.${user.id}` }, async (payload) => {
        const updated = payload.new as any;
        const isWaiting = updated?.session_status === "waiting_acceptance";
        const isInProgress = updated?.session_status === "in_progress";
        
        if ((isWaiting || isInProgress) && (payload.eventType === "INSERT" || (payload.eventType === "UPDATE" && !liveSessionIds.has(updated.id)))) {
          playNotificationSound();
          let teacherName = "المعلم";
          const { data: profile } = await supabase.from("public_profiles").select("full_name").eq("user_id", updated.teacher_id).single();
          if (profile) teacherName = profile.full_name;
          setJoinRequest({ bookingId: updated.id, teacherName });
          if (isInProgress) {
            setLiveSessionIds(prev => new Set(prev).add(updated.id));
          }
        }
        fetchBookings();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const fetchBookings = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("bookings")
      .select("id, scheduled_at, duration_minutes, status, session_status, teacher_id, subject_id, cancellation_reason, subjects(name)")
      .eq("student_id", user.id)
      .in("status", ["confirmed", "completed", "pending", "cancelled"])
      .order("scheduled_at", { ascending: false });

    if (!data || data.length === 0) { setBookings([]); setLoading(false); return; }

    const teacherIds = [...new Set(data.map(b => b.teacher_id))];
    const bookingIdsList = data.map(b => b.id);
    const [{ data: profiles }, { data: subs }, { data: sessions }] = await Promise.all([
      supabase.from("public_profiles").select("user_id, full_name").in("user_id", teacherIds),
      supabase.from("user_subscriptions").select("user_id, sessions_remaining, remaining_minutes, is_active").in("user_id", [user.id]).eq("is_active", true),
      supabase.from("sessions").select("booking_id, duration_minutes").in("booking_id", bookingIdsList),
    ]);
    const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));
    const hasSub = (subs ?? []).some(s => s.remaining_minutes > 4);
    const sessionMap = new Map((sessions ?? []).map(s => [s.booking_id, s.duration_minutes]));

    const inProgress = data.filter(b => b.session_status === "in_progress").map(b => b.id);
    setLiveSessionIds(new Set(inProgress));

    setBookings(data.map(b => ({
      id: b.id,
      scheduled_at: b.scheduled_at,
      duration_minutes: b.duration_minutes,
      status: b.status,
      session_status: b.session_status,
      teacher_id: b.teacher_id,
      teacher_name: profileMap.get(b.teacher_id) || "معلم",
      subject_name: (b.subjects as any)?.name || "مادة",
      has_subscription: hasSub,
      actual_duration_minutes: sessionMap.get(b.id) ?? null,
    })));
    setLoading(false);
  };

  const handleInstantSession = async (teacherId: string, teacherName: string) => {
    if (!user) return;

    // Auto-cancel any old pending requests this student has with this teacher (avoid stuck waiting_acceptance)
    await supabase
      .from("bookings")
      .update({ session_status: "expired", status: "cancelled" as any })
      .eq("teacher_id", teacherId)
      .eq("student_id", user.id)
      .eq("session_status", "waiting_acceptance");

    // Check if teacher is currently in a LIVE session (only in_progress counts as busy)
    const { data: liveBooking } = await supabase
      .from("bookings")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("session_status", "in_progress")
      .limit(1)
      .maybeSingle();

    if (liveBooking) {
      toast.error("المعلم في جلسة الآن", {
        description: "سيتم إعلامك حال انتهاء جلسته. يمكنك حجز جلسة مع معلم آخر.",
        action: { label: "ابحث عن معلم آخر", onClick: () => (window.location.href = "/search") },
      });
      // Subscribe student to be notified when teacher is free
      try {
        await supabase.from("notifications").insert({
          user_id: user.id,
          title: "⏳ بانتظار المعلم",
          body: `سيتم إعلامك فور توفر ${teacherName} لاستقبال جلستك.`,
          type: "info",
        });
      } catch {}
      return;
    }

    // Check student balance
    const { data: subs } = await supabase
      .from("user_subscriptions")
      .select("remaining_minutes")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .gt("remaining_minutes", 4);

    if (!subs || subs.length === 0) {
      toast.error("ليس لديك رصيد كافٍ في الباقة لبدء جلسة");
      return;
    }

    // Detect if this is the FIRST booking ever between this student and teacher
    // and that we have not already sent a first_impression notification for this pair.
    const studentTag = `[ref:${user.id.slice(0, 8)}]`;
    const [{ count: priorCount }, { count: impressionCount }] = await Promise.all([
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("teacher_id", teacherId)
        .eq("student_id", user.id),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", teacherId)
        .eq("type", "first_impression")
        .ilike("body", `%${studentTag}%`),
    ]);
    const isFirstBooking = (!priorCount || priorCount === 0) && (!impressionCount || impressionCount === 0);

    // Create booking and send request to teacher
    const { data: newBooking, error } = await supabase.from("bookings").insert({
      teacher_id: teacherId,
      student_id: user.id,
      scheduled_at: new Date().toISOString(),
      duration_minutes: 60,
      status: "confirmed" as any,
      session_status: "waiting_acceptance",
    }).select("id").single();

    if (error || !newBooking) {
      toast.error("تعذر إنشاء الجلسة");
      return;
    }

    await supabase.from("notifications").insert({
      user_id: teacherId,
      ...notificationTemplates.instantSessionFromStudent(),
    });

    // First-impression reminder for the teacher (first time this student books with them)
    if (isFirstBooking) {
      await supabase.from("notifications").insert({
        user_id: teacherId,
        title: "✨ تذكير مهم: الانطباع الأول",
        body: `الجلسة الأولى تترك أثرًا دائمًا — كن إيجابيًا، مهنيًا، ولطيفًا. كل طالب هو عميل مهم، تصرّف باحتراف والتزام. كن جاهزًا قبل الجلسة، وحدّد المادة أو الموضوع المطلوب، وراجع أي ملاحظات أو أهداف خاصة (مثل: امتحان قريب أو مهارة يحتاج دعم فيها). ابدأ على الموعد تمامًا. ${studentTag}`,
        type: "first_impression",
      });
    }

    toast.success(`تم إرسال طلب جلسة فورية إلى ${teacherName}`);
    fetchBookings();
  };

  const handleDeleteBooking = (bookingId: string) => {
    handleHideBooking(bookingId);
  };

  const getStatusBadge = (status: string, isLive: boolean) => {
    if (isLive) return <Badge className="bg-secondary/10 text-secondary border-0 text-[10px] animate-pulse">🔴 جارية الآن</Badge>;
    switch (status) {
      case "completed":
        return <Badge className="bg-primary/10 text-primary border-0 text-[10px]">مكتملة</Badge>;
      case "confirmed":
        return <Badge className="bg-secondary/10 text-secondary border-0 text-[10px]">مؤكدة</Badge>;
      case "pending":
        return <Badge className="bg-amber-500/10 text-amber-600 border-0 text-[10px]">قيد الانتظار</Badge>;
      case "cancelled":
        return <Badge className="bg-destructive/10 text-destructive border-0 text-[10px]">تم الإلغاء</Badge>;
      default:
        return <Badge className="bg-muted text-muted-foreground border-0 text-[10px]">{status}</Badge>;
    }
  };

  const groupedByTeacher = useMemo(() => {
    const groups: Record<string, { teacherName: string; teacherId: string; bookings: BookingRow[] }> = {};
    visibleBookings.forEach(b => {
      const key = b.teacher_id || "unknown";
      if (!groups[key]) {
        groups[key] = { teacherName: b.teacher_name || "معلم", teacherId: key, bookings: [] };
      }
      groups[key].bookings.push(b);
    });
    return Object.values(groups);
  }, [visibleBookings]);

  if (loading) {
    return (
      <Card className="border-0 shadow-card">
        <CardContent className="p-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Join Request Dialog */}
      <Dialog open={!!joinRequest} onOpenChange={() => setJoinRequest(null)}>
        <DialogContent className="sm:max-w-md text-center" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg">🎓 دعوة للانضمام للحصة</DialogTitle>
            <DialogDescription className="text-sm mt-2">
              المعلم <strong>{joinRequest?.teacherName}</strong> يدعوك لبدء جلسة فورية. هل تريد الانضمام؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-center mt-4">
            <Button
              className="gradient-cta text-secondary-foreground rounded-xl shadow-button gap-2 flex-1"
              onClick={async () => {
                if (joinRequest?.bookingId) {
                  // Accept: update session_status to in_progress
                  await supabase.from("bookings").update({ session_status: "in_progress" }).eq("id", joinRequest.bookingId);
                  setLiveSessionIds(prev => new Set(prev).add(joinRequest.bookingId));
                  // Notify teacher
                  const booking = bookings.find(b => b.id === joinRequest.bookingId);
                  if (booking?.teacher_id) {
                    await supabase.from("notifications").insert({
                      user_id: booking.teacher_id,
                      ...notificationTemplates.instantSessionAccepted(),
                    });
                  }
                  setJoinRequest(null);
                  window.location.href = `/session?booking=${joinRequest.bookingId}`;
                }
              }}
            >
              <Video className="h-4 w-4" />
              انضم الآن
            </Button>
            <Button
              variant="outline"
              className="rounded-xl flex-1"
              onClick={async () => {
                if (joinRequest?.bookingId) {
                  // Reject: cancel the booking
                  await supabase.from("bookings").update({ session_status: "rejected", status: "cancelled" as any }).eq("id", joinRequest.bookingId);
                  const booking = bookings.find(b => b.id === joinRequest.bookingId);
                  if (booking?.teacher_id) {
                    await supabase.from("notifications").insert({
                      user_id: booking.teacher_id,
                      ...notificationTemplates.instantSessionRejected(),
                    });
                  }
                }
                setJoinRequest(null);
                fetchBookings();
              }}
            >
              رفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-0 shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 font-bold flex-wrap">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <CalendarCheck className="h-4 w-4 text-primary" />
            </div>
            جدول الحصص
            {visibleBookings.length > 0 && <Badge className="bg-primary/10 text-primary border-0 text-xs">{visibleBookings.length}</Badge>}
            <div className="mr-auto flex items-center gap-1.5">
              {hiddenIds.size > 0 && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] gap-1" onClick={handleRestoreAll} title="استعادة الحصص المخفية">
                  <RotateCcw className="h-3 w-3" /> استعادة ({hiddenIds.size})
                </Button>
              )}
              {visibleBookings.length > 0 && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] gap-1 text-destructive hover:bg-destructive/10" onClick={handleClearAll} title="مسح الجدول بالكامل">
                  <Eraser className="h-3 w-3" /> مسح الجدول
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {groupedByTeacher.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">لا توجد حصص</p>
          ) : (
            groupedByTeacher.map(group => {
              const isExpanded = expandedTeacher === group.teacherId;
              const completedCount = group.bookings.filter(b => b.status === "completed").length;
              const activeCount = group.bookings.filter(b => b.status !== "completed").length;
              const hasLive = group.bookings.some(b => liveSessionIds.has(b.id));
              const groupUnread = unreadByTeacher[group.teacherId] || 0;
              const chatBookingId = latestBookingByTeacher[group.teacherId];

              return (
                <div key={group.teacherId} className={`rounded-xl border overflow-hidden ${hasLive ? "border-secondary/50 bg-secondary/5" : "bg-muted/20"}`}>
                  <button
                    onClick={() => setExpandedTeacher(isExpanded ? null : group.teacherId)}
                    className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-right"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${hasLive ? "bg-secondary/20" : "bg-primary/10"}`}>
                        <User className={`h-4 w-4 ${hasLive ? "text-secondary" : "text-primary"}`} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">
                          {group.teacherName}
                          {hasLive && <span className="text-secondary text-xs mr-2 animate-pulse">● متصل الآن</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activeCount > 0 && <span className="text-secondary">{activeCount} حصة قادمة</span>}
                          {activeCount > 0 && completedCount > 0 && " • "}
                          {completedCount > 0 && <span>{completedCount} مكتملة</span>}
                        </p>
                      </div>
                    {/* Sessions are joined from upcoming sessions section */}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg h-7 px-2 gap-1 text-[10px] border-secondary/30 text-secondary hover:bg-secondary/10"
                        onClick={(e) => { e.stopPropagation(); handleInstantSession(group.teacherId, group.teacherName); }}
                      >
                        <PhoneCall className="h-3.5 w-3.5" />
                        جلسة فورية
                      </Button>
                      {chatBookingId && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg h-7 px-2 gap-1 text-[10px] relative"
                          onClick={(e) => e.stopPropagation()}
                          asChild
                        >
                          <Link to={`/chat?booking=${chatBookingId}`}>
                            <MessageSquare className="h-3.5 w-3.5" />
                            دردشة
                            {groupUnread > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[8px] flex items-center justify-center font-bold">
                                {groupUnread}
                              </span>
                            )}
                          </Link>
                        </Button>
                      )}
                      <Badge className="bg-primary/10 text-primary border-0 text-[10px]">{group.bookings.length} حصة</Badge>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t overflow-hidden"
                      >
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border/50 bg-muted/30">
                                <th className="text-right py-2 px-3 text-xs font-bold text-muted-foreground">المادة</th>
                                <th className="text-right py-2 px-3 text-xs font-bold text-muted-foreground">التاريخ</th>
                                <th className="text-right py-2 px-3 text-xs font-bold text-muted-foreground">الوقت</th>
                                <th className="text-right py-2 px-3 text-xs font-bold text-muted-foreground">المدة</th>
                                <th className="text-right py-2 px-3 text-xs font-bold text-muted-foreground">المدة الفعلية</th>
                                <th className="text-right py-2 px-3 text-xs font-bold text-muted-foreground">الحالة</th>
                                <th className="text-right py-2 px-3 text-xs font-bold text-muted-foreground">إجراءات</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.bookings.map(b => {
                                const isLive = liveSessionIds.has(b.id);
                                return (
                                  <tr key={b.id} className={`border-b border-border/20 transition-colors ${isLive ? "bg-secondary/10" : b.status === "completed" ? "bg-destructive/5" : "hover:bg-muted/50"}`}>
                                    <td className="py-2.5 px-3 text-muted-foreground">{b.subject_name}</td>
                                    <td className="py-2.5 px-3 text-muted-foreground">{new Date(b.scheduled_at).toLocaleDateString("ar-SA")}</td>
                                    <td className="py-2.5 px-3 text-muted-foreground">{new Date(b.scheduled_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}</td>
                                    <td className="py-2.5 px-3 text-muted-foreground">{b.duration_minutes} د</td>
                                    <td className="py-2.5 px-3 text-muted-foreground">
                                      {b.status === "completed" && b.actual_duration_minutes != null
                                        ? `${Math.floor(b.actual_duration_minutes / 60) > 0 ? Math.floor(b.actual_duration_minutes / 60) + " س " : ""}${b.actual_duration_minutes % 60} د`
                                        : <span className="text-muted-foreground/50">-</span>}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <div className="flex items-center gap-2">
                                        {getStatusBadge(b.status, isLive)}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                        onClick={() => handleDeleteBooking(b.id)}
                                        title="حذف الحصة"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </>
  );
}
