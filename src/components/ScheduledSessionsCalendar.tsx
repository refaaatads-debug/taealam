import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CalendarClock,
  Loader2,
  Video,
  ChevronRight,
  ChevronLeft,
  CalendarDays,
  Grid3x3,
  List,
  Filter,
  MessageSquare,
  X,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { notificationTemplates } from "@/lib/notificationTemplates";
import CancelSessionDialog from "@/components/teacher/CancelSessionDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Row {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  subject_id: string | null;
  subject_name: string;
  other_name: string;
  other_id: string;
  session_status?: string | null;
  status?: string | null;
}

interface Props {
  role: "student" | "teacher";
}

type View = "month" | "week";
type DateFilter = "all" | "this_week" | "this_month";

const ARABIC_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const startOfWeek = (d: Date) => {
  const r = new Date(d);
  r.setDate(d.getDate() - d.getDay());
  r.setHours(0, 0, 0, 0);
  return r;
};

export default function ScheduledSessionsCalendar({ role }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { play } = useNotificationSound();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());
  const [joining, setJoining] = useState<string | null>(null);
  const [teacherCancelTarget, setTeacherCancelTarget] = useState<{ id: string; studentId?: string } | null>(null);
  const [studentCancelTarget, setStudentCancelTarget] = useState<Row | null>(null);
  const [cancellingStudent, setCancellingStudent] = useState(false);
  const unreadCounts = useUnreadMessages(rows.map((row) => row.id));

  // Filters
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [otherFilter, setOtherFilter] = useState<string>("all"); // teacher OR student
  const [subjectFilter, setSubjectFilter] = useState<string>("all");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const fetchRows = async () => {
    if (!user) return;
    const filterCol = role === "student" ? "student_id" : "teacher_id";
    const otherCol = role === "student" ? "teacher_id" : "student_id";
    const { data } = await supabase
      .from("bookings")
      .select(`id, scheduled_at, duration_minutes, session_status, status, ${otherCol}, subject_id, subjects(name)`)
      .eq(filterCol, user.id)
      .in("status", ["confirmed", "pending"]) // exclude cancelled / completed
      .gte("scheduled_at", new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString())
      .lte("scheduled_at", new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString())
      .order("scheduled_at", { ascending: true });

    if (!data || data.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    const otherIds = [...new Set(data.map((b: any) => b[otherCol]).filter(Boolean))];
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("user_id, full_name")
      .in("user_id", otherIds);
    const nameMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));

    setRows(
      (data as any[]).map((b) => ({
        id: b.id,
        scheduled_at: b.scheduled_at,
        duration_minutes: b.duration_minutes,
        session_status: b.session_status,
        status: b.status,
        subject_id: b.subject_id,
        subject_name: (b.subjects as any)?.name || "—",
        other_id: b[otherCol],
        other_name: nameMap.get(b[otherCol]) || (role === "student" ? "معلم" : "طالب"),
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchRows();
    // Realtime is normally enough, but polling keeps the calendar reliable
    // when a browser/tab misses the booking update that marks a session live.
    const refreshTimer = window.setInterval(fetchRows, 15_000);
    const channel = supabase
      .channel(`sched-cal-${role}-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `${role === "student" ? "student_id" : "teacher_id"}=eq.${user.id}`,
        },
        () => fetchRows()
      )
      .subscribe();
    return () => {
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [user, role]);

  // 1-hour-before reminder — server-side dedup via UNIQUE constraint on session_reminders_sent
  useEffect(() => {
    if (!user) return;
    rows.forEach(async (r) => {
      const diff = new Date(r.scheduled_at).getTime() - Date.now();
      if (diff > 0 && diff <= 60 * 60_000) {
        // Atomic claim: insert; if duplicate (UNIQUE violation), another tab/device already did it
        const { error } = await supabase
          .from("session_reminders_sent" as any)
          .insert({ booking_id: r.id, user_id: user.id, reminder_type: "one_hour" } as any);
        if (error) return; // already sent (UNIQUE conflict) or RLS — silently skip
        play();
        toast.message("⏰ تذكير: حصة قريبة", {
          description: `${r.other_name} • ${r.subject_name} — تبدأ خلال ساعة`,
          duration: 8000,
        });
        try {
          await supabase.from("notifications").insert({
            user_id: user.id,
            ...notificationTemplates.sessionReminder({
              subjectName: r.subject_name,
              otherName: r.other_name,
            }),
          });
        } catch {}
      }
    });
  }, [rows, now, user, play]);

  // Apply filters
  const filteredRows = useMemo(() => {
    const today = new Date();
    const startWk = startOfWeek(today);
    const endWk = new Date(startWk); endWk.setDate(endWk.getDate() + 7);
    const startMo = startOfMonth(today);
    const endMo = new Date(endOfMonth(today)); endMo.setHours(23, 59, 59, 999);
    return rows.filter((r) => {
      const d = new Date(r.scheduled_at);
      if (dateFilter === "this_week" && (d < startWk || d >= endWk)) return false;
      if (dateFilter === "this_month" && (d < startMo || d > endMo)) return false;
      if (otherFilter !== "all" && r.other_id !== otherFilter) return false;
      if (subjectFilter !== "all" && r.subject_id !== subjectFilter) return false;
      return true;
    });
  }, [rows, dateFilter, otherFilter, subjectFilter]);

  const otherOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => map.set(r.other_id, r.other_name));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [rows]);

  const subjectOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => { if (r.subject_id) map.set(r.subject_id, r.subject_name); });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [rows]);

  // Group by date string for fast lookup
  const byDate = useMemo(() => {
    const map = new Map<string, Row[]>();
    filteredRows.forEach((r) => {
      const d = new Date(r.scheduled_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = map.get(key) || [];
      list.push(r);
      map.set(key, list);
    });
    return map;
  }, [filteredRows]);

  const getCellSessions = (date: Date): Row[] => {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    return byDate.get(key) || [];
  };

  // Unique student/teacher names per cell day
  const getCellNames = (date: Date): string[] => {
    const set = new Set<string>();
    getCellSessions(date).forEach((s) => set.add(s.other_name));
    return Array.from(set);
  };

  const monthCells = useMemo(() => {
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);
    const startWeekday = start.getDay();
    const daysInMonth = end.getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const navigatePeriod = (dir: -1 | 1) => {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + dir * 7);
    setCursor(d);
  };

  const periodLabel = useMemo(() => {
    if (view === "month") return `${ARABIC_MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    const start = weekDays[0];
    const end = weekDays[6];
    return `${start.getDate()} ${ARABIC_MONTHS[start.getMonth()]} - ${end.getDate()} ${ARABIC_MONTHS[end.getMonth()]}`;
  }, [view, cursor, weekDays]);

  const selectedSessions = selectedDay ? getCellSessions(selectedDay) : [];
  const today = new Date();

  const handleJoin = async (id: string) => {
    setJoining(id);
    // Small visual delay so the loading state is perceivable
    setTimeout(() => navigate(`/session?booking=${id}`), 200);
  };

  const handleStudentCancel = async () => {
    if (!user || !studentCancelTarget) return;
    setCancellingStudent(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "cancelled", session_status: "cancelled" } as any)
        .eq("id", studentCancelTarget.id)
        .eq("student_id", user.id);

      if (error) throw error;

      await supabase.from("notifications").insert({
        user_id: studentCancelTarget.other_id,
        ...notificationTemplates.bookingCancelledByStudent({
          subjectName: studentCancelTarget.subject_name,
          scheduledAt: studentCancelTarget.scheduled_at,
        }),
      });

      toast.success("تم إلغاء الحصة بنجاح");
      setStudentCancelTarget(null);
      await fetchRows();
    } catch {
      toast.error("حدث خطأ أثناء إلغاء الحصة");
    } finally {
      setCancellingStudent(false);
    }
  };

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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg flex items-center gap-2 font-bold">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <CalendarClock className="h-4 w-4 text-primary" />
            </div>
            الجدول اليومي
            {filteredRows.length > 0 && (
              <Badge className="bg-primary/10 text-primary border-0 text-xs">
                {filteredRows.length}
              </Badge>
            )}
          </CardTitle>

          <div className="flex items-center gap-1.5">
            <Button size="sm" variant={view === "month" ? "default" : "outline"} className="h-8 gap-1 text-xs" onClick={() => setView("month")}>
              <Grid3x3 className="h-3 w-3" /> شهري
            </Button>
            <Button size="sm" variant={view === "week" ? "default" : "outline"} className="h-8 gap-1 text-xs" onClick={() => setView("week")}>
              <CalendarDays className="h-3 w-3" /> أسبوعي
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            فلترة:
          </div>
          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
            <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل التواريخ</SelectItem>
              <SelectItem value="this_week">هذا الأسبوع</SelectItem>
              <SelectItem value="this_month">هذا الشهر</SelectItem>
            </SelectContent>
          </Select>
          {otherOptions.length > 1 && (
            <Select value={otherFilter} onValueChange={setOtherFilter}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder={role === "student" ? "المعلم" : "الطالب"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{role === "student" ? "كل المعلمين" : "كل الطلاب"}</SelectItem>
                {otherOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {subjectOptions.length > 1 && (
            <Select value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue placeholder="المادة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المواد</SelectItem>
                {subjectOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Period nav */}
        <div className="flex items-center justify-between mt-3">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigatePeriod(-1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">{periodLabel}</span>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setCursor(new Date()); setSelectedDay(new Date()); }}>
              اليوم
            </Button>
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigatePeriod(1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground border-b pb-1">
          {ARABIC_DAYS.map((d) => (<div key={d}>{d}</div>))}
        </div>

        <AnimatePresence mode="wait">
          {view === "month" ? (
            <motion.div key="month" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-7 gap-1">
              {monthCells.map((date, i) => {
                if (!date) return <div key={i} className="aspect-square" />;
                const sessions = getCellSessions(date);
                const names = getCellNames(date);
                const isToday = sameDay(date, today);
                const isSelected = selectedDay && sameDay(date, selectedDay);
                const isPast = date < new Date(today.toDateString());
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(date)}
                    className={`aspect-square min-h-[64px] rounded-lg border p-1 text-[10px] flex flex-col items-stretch justify-start transition-all hover:bg-muted/50 ${
                      isSelected
                        ? "ring-2 ring-primary bg-primary/5 border-primary/30"
                        : isToday
                        ? "border-secondary/50 bg-secondary/5"
                        : "border-border/40"
                    } ${isPast ? "opacity-50" : ""}`}
                  >
                    <span className={`font-bold text-center ${isToday ? "text-secondary" : "text-foreground"}`}>
                      {date.getDate()}
                    </span>
                    {names.length > 0 && (
                      <div className="mt-0.5 flex-1 flex flex-col gap-0.5 overflow-hidden">
                        {names.slice(0, 2).map((n) => (
                          <span key={n} className="truncate text-[9px] bg-primary/10 text-primary rounded px-1 py-0.5 text-right">
                            {n}
                          </span>
                        ))}
                        {names.length > 2 && (
                          <span className="text-[9px] text-muted-foreground text-center">+{names.length - 2}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </motion.div>
          ) : (
            <motion.div key="week" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-7 gap-1">
              {weekDays.map((date, i) => {
                const sessions = getCellSessions(date);
                const isToday = sameDay(date, today);
                const isSelected = selectedDay && sameDay(date, selectedDay);
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(date)}
                    className={`min-h-[120px] rounded-lg border p-2 text-right transition-all hover:bg-muted/50 ${
                      isSelected
                        ? "ring-2 ring-primary bg-primary/5 border-primary/30"
                        : isToday
                        ? "border-secondary/50 bg-secondary/5"
                        : "border-border/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground">{date.getDate()}/{date.getMonth() + 1}</span>
                      {isToday && <Badge className="bg-secondary/15 text-secondary border-0 text-[9px] h-4 px-1">اليوم</Badge>}
                    </div>
                    <div className="space-y-0.5">
                      {sessions.slice(0, 3).map((s) => {
                        const live = s.session_status === "in_progress";
                        return (
                          <div key={s.id} className={`text-[9px] rounded px-1 py-0.5 truncate ${live ? "bg-secondary/20 text-secondary" : "bg-primary/10 text-primary"}`}>
                            {new Date(s.scheduled_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}{" "}
                            {s.other_name}
                          </div>
                        );
                      })}
                      {sessions.length > 3 && (<div className="text-[9px] text-muted-foreground">+{sessions.length - 3}</div>)}
                    </div>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Unified daily timeline */}
        {selectedDay && (
          <div className="border-t pt-3">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <List className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-bold text-foreground">
                    جدول {ARABIC_DAYS[selectedDay.getDay()]}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {selectedDay.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">{selectedSessions.length} حصة</Badge>
              </div>
              <span className="text-[10px] text-muted-foreground">الوقت بتوقيت الرياض</span>
            </div>

            {selectedSessions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 py-7 text-center">
                <CalendarClock className="h-7 w-7 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs font-semibold text-muted-foreground">لا توجد حصص أو مواعيد في هذا اليوم</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">اختر يومًا آخر من الجدول لمراجعة مواعيدك</p>
              </div>
            ) : (
              <div className="relative space-y-2 before:absolute before:right-[52px] before:top-4 before:bottom-4 before:w-px before:bg-border/70">
                {selectedSessions.map((s) => {
                  const live = s.session_status === "in_progress";
                  const confirmed = s.status === "confirmed";
                  const waitingAcceptance = s.session_status === "waiting_acceptance";
                  // A confirmed booking can be opened before its scheduled time.
                  // The teacher starts it from the pre-join screen; the student
                  // waits there until the teacher changes the status to live.
                  const closed = s.session_status === "completed" || s.session_status === "cancelled";
                  const canEnterSession = live || (confirmed && !waitingAcceptance && !closed);
                  const isJoining = joining === s.id;
                  const unread = unreadCounts[s.id] || 0;
                  return (
                    <div key={s.id} className={`relative z-[1] grid grid-cols-[58px_1fr] items-start gap-3 ${live ? "rounded-xl" : ""}`}>
                      <div className="pt-3 text-center">
                        <p className={`text-xs font-black ${live ? "text-secondary" : "text-foreground"}`}>
                          {new Date(s.scheduled_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <p className="text-[9px] text-muted-foreground mt-0.5">{s.duration_minutes} دقيقة</p>
                        <span className={`mx-auto mt-2 block h-2.5 w-2.5 rounded-full border-2 border-background ${live ? "bg-secondary ring-4 ring-secondary/15" : "bg-primary"}`} />
                      </div>
                      <div className={`rounded-xl border p-3 ${live ? "border-secondary/40 bg-secondary/5 shadow-sm" : "border-border/50 bg-card/80"}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-black text-foreground truncate">{s.subject_name}</p>
                              {live ? (
                                <Badge className="bg-secondary/15 text-secondary border-0 text-[10px] animate-pulse">جارية الآن</Badge>
                              ) : s.session_status === "waiting_acceptance" ? (
                                <Badge className="bg-amber-500/15 text-amber-700 border-0 text-[10px]">جلسة فورية · بانتظار القبول</Badge>
                              ) : s.status === "pending" ? (
                                <Badge className="bg-amber-500/15 text-amber-700 border-0 text-[10px]">بانتظار التأكيد</Badge>
                              ) : (
                                <Badge className="bg-primary/10 text-primary border-0 text-[10px]">مؤكدة</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {role === "student" ? "مع المعلم" : "مع الطالب"}: <span className="font-semibold text-foreground/80">{s.other_name}</span>
                            </p>
                             {!live && canEnterSession && (
                               <p className="text-[10px] text-primary/80 mt-1">يمكن بدء الحصة الآن دون انتظار الموعد المحدد</p>
                             )}
                          </div>
                          <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:shrink-0">
                            <Button size="sm" variant="outline" className="h-8 min-w-0 flex-1 rounded-lg gap-1 px-2.5 text-[10px] relative sm:flex-none" onClick={() => navigate(`/chat?booking=${s.id}`)}>
                              <MessageSquare className="h-3.5 w-3.5" />
                              محادثة
                              {unread > 0 && <span className="absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">{unread}</span>}
                            </Button>
                            {!live && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 min-w-0 flex-1 rounded-lg gap-1 px-2.5 text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive sm:flex-none"
                                onClick={() => role === "teacher"
                                  ? setTeacherCancelTarget({ id: s.id, studentId: s.other_id })
                                  : setStudentCancelTarget(s)}
                              >
                                <X className="h-3.5 w-3.5" />
                                إلغاء
                              </Button>
                            )}
                              {canEnterSession && (
                              <Button
                                size="sm"
                                className="h-8 min-w-0 flex-1 rounded-lg gradient-cta text-secondary-foreground gap-1 px-2.5 text-[10px] sm:flex-none"
                                onClick={() => handleJoin(s.id)}
                                disabled={isJoining}
                              >
                                {isJoining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
                                 {isJoining ? "..." : live ? "انضم الآن" : role === "teacher" ? "ابدأ الحصة" : "انضم للحصة"}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>

      <CancelSessionDialog
        open={role === "teacher" && !!teacherCancelTarget}
        onOpenChange={(open) => !open && setTeacherCancelTarget(null)}
        bookingId={teacherCancelTarget?.id ?? null}
        studentId={teacherCancelTarget?.studentId ?? null}
        onCancelled={() => {
          setTeacherCancelTarget(null);
          fetchRows();
        }}
      />

      <AlertDialog
        open={role === "student" && !!studentCancelTarget}
        onOpenChange={(open) => !open && setStudentCancelTarget(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء الحصة</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من إلغاء حصة {studentCancelTarget?.subject_name || "حصة"} مع{" "}
              {studentCancelTarget?.other_name || "المعلم"}؟ سيتم إخطار المعلم بالإلغاء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancellingStudent}>تراجع</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleStudentCancel}
              disabled={cancellingStudent}
            >
              {cancellingStudent ? "جارٍ الإلغاء..." : "نعم، إلغاء الحصة"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
