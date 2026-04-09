import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarCheck, Loader2, MessageSquare, ChevronDown, ChevronUp, User, PhoneCall, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface BookingRow {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  session_status?: string | null;
  student_name?: string;
  subject_name?: string;
  student_id?: string;
  has_subscription?: boolean;
  actual_duration_minutes?: number | null;
}

export default function TeacherScheduleTable() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const bookingIds = useMemo(() => bookings.map(b => b.id), [bookings]);
  const unreadCounts = useUnreadMessages(bookingIds);

  // Compute total unread per student
  const unreadByStudent = useMemo(() => {
    const result: Record<string, number> = {};
    bookings.forEach(b => {
      const key = b.student_id || "unknown";
      result[key] = (result[key] || 0) + (unreadCounts[b.id] || 0);
    });
    return result;
  }, [bookings, unreadCounts]);

  // Get latest booking id per student for chat link
  const latestBookingByStudent = useMemo(() => {
    const result: Record<string, string> = {};
    bookings.forEach(b => {
      const key = b.student_id || "unknown";
      if (!result[key]) result[key] = b.id; // bookings are ordered desc, first is latest
    });
    return result;
  }, [bookings]);

  useEffect(() => {
    if (!user) return;
    fetchBookings();

    const channel = supabase
      .channel("teacher-schedule-table")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `teacher_id=eq.${user.id}` }, () => {
        fetchBookings();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const fetchBookings = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("bookings")
      .select("id, scheduled_at, duration_minutes, status, student_id, subject_id, subjects(name)")
      .eq("teacher_id", user.id)
      .in("status", ["confirmed", "completed", "pending"])
      .order("scheduled_at", { ascending: false });

    if (!data || data.length === 0) { setBookings([]); setLoading(false); return; }

    const studentIds = [...new Set(data.map(b => b.student_id))];
    const bookingIds = data.map(b => b.id);
    const [{ data: profiles }, { data: subs }, { data: sessions }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name").in("user_id", studentIds),
      supabase.from("user_subscriptions").select("user_id, sessions_remaining, is_active").in("user_id", studentIds).eq("is_active", true),
      supabase.from("sessions").select("booking_id, duration_minutes").in("booking_id", bookingIds),
    ]);
    const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));
    const subSet = new Set((subs ?? []).filter(s => s.sessions_remaining > 0).map(s => s.user_id));
    const sessionMap = new Map((sessions ?? []).map(s => [s.booking_id, s.duration_minutes]));

    setBookings(data.map(b => ({
      id: b.id,
      scheduled_at: b.scheduled_at,
      duration_minutes: b.duration_minutes,
      status: b.status,
      student_id: b.student_id,
      student_name: profileMap.get(b.student_id) || "طالب",
      subject_name: (b.subjects as any)?.name || "مادة",
      has_subscription: subSet.has(b.student_id),
      actual_duration_minutes: sessionMap.get(b.id) ?? null,
    })));
    setLoading(false);
  };

  const handleInstantSession = async (studentId: string, studentName: string) => {
    if (!user) return;

    // Instant sessions are NOT bound by teacher availability schedule

    // Check student subscription
    const { data: subs } = await supabase
      .from("user_subscriptions")
      .select("remaining_minutes")
      .eq("user_id", studentId)
      .eq("is_active", true)
      .gt("remaining_minutes", 4);
    
    if (!subs || subs.length === 0) {
      toast.error(`الطالب ${studentName} ليس لديه رصيد كافٍ في الباقة`);
      return;
    }

    const { data: newBooking, error } = await supabase.from("bookings").insert({
      teacher_id: user.id,
      student_id: studentId,
      scheduled_at: new Date().toISOString(),
      duration_minutes: 60,
      status: "confirmed" as any,
      session_status: "in_progress",
    }).select("id").single();

    if (error || !newBooking) {
      toast.error("تعذر إنشاء الجلسة");
      return;
    }

    await supabase.from("notifications").insert({
      user_id: studentId,
      title: "📞 طلب جلسة فورية",
      body: `المعلم يريد بدء جلسة فورية معك. انضم الآن!`,
      type: "session_request",
    });

    toast.success(`تم إرسال طلب جلسة فورية إلى ${studentName}`);
    fetchBookings();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-destructive/10 text-destructive border-0 text-[10px]">مكتملة</Badge>;
      case "confirmed":
        return <Badge className="bg-secondary/10 text-secondary border-0 text-[10px]">مؤكدة</Badge>;
      case "pending":
        return <Badge className="bg-amber-500/10 text-amber-600 border-0 text-[10px]">قيد الانتظار</Badge>;
      default:
        return <Badge className="bg-muted text-muted-foreground border-0 text-[10px]">{status}</Badge>;
    }
  };

  const groupedByStudent = useMemo(() => {
    const groups: Record<string, { studentName: string; studentId: string; bookings: BookingRow[] }> = {};
    bookings.forEach(b => {
      const key = b.student_id || "unknown";
      if (!groups[key]) {
        groups[key] = { studentName: b.student_name || "طالب", studentId: key, bookings: [] };
      }
      groups[key].bookings.push(b);
    });
    return Object.values(groups);
  }, [bookings]);

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
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <CalendarCheck className="h-4 w-4 text-primary" />
          </div>
          جدول الحصص
          {bookings.length > 0 && <Badge className="mr-auto bg-primary/10 text-primary border-0 text-xs">{bookings.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {groupedByStudent.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">لا توجد حصص</p>
        ) : (
          groupedByStudent.map(group => {
            const isExpanded = expandedStudent === group.studentId;
            const completedCount = group.bookings.filter(b => b.status === "completed").length;
            const activeCount = group.bookings.filter(b => b.status !== "completed").length;
            const groupUnread = unreadByStudent[group.studentId] || 0;
            const chatBookingId = latestBookingByStudent[group.studentId];

            return (
              <div key={group.studentId} className="rounded-xl border bg-muted/20 overflow-hidden">
                <button
                  onClick={() => setExpandedStudent(isExpanded ? null : group.studentId)}
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-right"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{group.studentName}</p>
                      <p className="text-xs text-muted-foreground">
                        {activeCount > 0 && <span className="text-secondary">{activeCount} حصة قادمة</span>}
                        {activeCount > 0 && completedCount > 0 && " • "}
                        {completedCount > 0 && <span>{completedCount} مكتملة</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg h-7 px-2 gap-1 text-[10px] border-secondary/30 text-secondary hover:bg-secondary/10"
                      onClick={(e) => { e.stopPropagation(); handleInstantSession(group.studentId, group.studentName); }}
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
                            </tr>
                          </thead>
                          <tbody>
                            {group.bookings.map(b => (
                              <tr key={b.id} className={`border-b border-border/20 transition-colors ${b.status === "completed" ? "bg-destructive/5" : "hover:bg-muted/50"}`}>
                                <td className="py-2.5 px-3 text-muted-foreground">{b.subject_name}</td>
                                <td className="py-2.5 px-3 text-muted-foreground">{new Date(b.scheduled_at).toLocaleDateString("ar-SA")}</td>
                                <td className="py-2.5 px-3 text-muted-foreground">{new Date(b.scheduled_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}</td>
                                <td className="py-2.5 px-3 text-muted-foreground">{b.duration_minutes} د</td>
                                <td className="py-2.5 px-3 text-muted-foreground">
                                  {b.status === "completed" && b.actual_duration_minutes != null
                                    ? `${Math.floor(b.actual_duration_minutes / 60) > 0 ? Math.floor(b.actual_duration_minutes / 60) + " س " : ""}${b.actual_duration_minutes % 60} د`
                                    : <span className="text-muted-foreground/50">-</span>}
                                </td>
                                <td className="py-2.5 px-3">{getStatusBadge(b.status)}</td>
                              </tr>
                            ))}
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
  );
}
