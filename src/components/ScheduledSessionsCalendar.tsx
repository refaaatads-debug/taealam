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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface Row {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  subject_name: string;
  other_name: string;
  other_id: string;
  session_status?: string | null;
}

interface Props {
  role: "student" | "teacher";
}

type View = "month" | "week";

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
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());

  const notifiedKey = user ? `upcoming_hour_notified_${user.id}` : "upcoming_hour_notified";
  const [notifiedIds] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(notifiedKey) || "[]"));
    } catch {
      return new Set<string>();
    }
  });

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
      .select(`id, scheduled_at, duration_minutes, session_status, ${otherCol}, subject_id, subjects(name)`)
      .eq(filterCol, user.id)
      .in("status", ["confirmed", "pending"])
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
      supabase.removeChannel(channel);
    };
  }, [user, role]);

  // 1-hour-before reminder per session
  useEffect(() => {
    if (!user) return;
    rows.forEach(async (r) => {
      const diff = new Date(r.scheduled_at).getTime() - Date.now();
      if (diff > 0 && diff <= 60 * 60_000 && !notifiedIds.has(r.id)) {
        notifiedIds.add(r.id);
        try {
          localStorage.setItem(notifiedKey, JSON.stringify([...notifiedIds]));
        } catch {}
        play();
        toast.message("⏰ تذكير: حصة قريبة", {
          description: `${r.other_name} • ${r.subject_name} — تبدأ خلال ساعة`,
          duration: 8000,
        });
        try {
          await supabase.from("notifications").insert({
            user_id: user.id,
            title: "⏰ تذكير: حصتك بعد ساعة",
            body: `حصة ${r.subject_name} مع ${r.other_name}`,
            type: "session_reminder",
          });
        } catch {}
      }
    });
  }, [rows, now, user, notifiedIds, play, notifiedKey]);

  // Group by date string for fast lookup
  const byDate = useMemo(() => {
    const map = new Map<string, Row[]>();
    rows.forEach((r) => {
      const d = new Date(r.scheduled_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = map.get(key) || [];
      list.push(r);
      map.set(key, list);
    });
    return map;
  }, [rows]);

  const getCellSessions = (date: Date): Row[] => {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    return byDate.get(key) || [];
  };

  // ─── Month grid ───
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

  // ─── Week grid ───
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
    if (view === "month") {
      return `${ARABIC_MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    }
    const start = weekDays[0];
    const end = weekDays[6];
    return `${start.getDate()} ${ARABIC_MONTHS[start.getMonth()]} - ${end.getDate()} ${ARABIC_MONTHS[end.getMonth()]}`;
  }, [view, cursor, weekDays]);

  const selectedSessions = selectedDay ? getCellSessions(selectedDay) : [];
  const today = new Date();

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
            جدول الحصص المجدولة
            {rows.length > 0 && (
              <Badge className="bg-primary/10 text-primary border-0 text-xs">
                {rows.length}
              </Badge>
            )}
          </CardTitle>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant={view === "month" ? "default" : "outline"}
              className="h-8 gap-1 text-xs"
              onClick={() => setView("month")}
            >
              <Grid3x3 className="h-3 w-3" /> شهري
            </Button>
            <Button
              size="sm"
              variant={view === "week" ? "default" : "outline"}
              className="h-8 gap-1 text-xs"
              onClick={() => setView("week")}
            >
              <CalendarDays className="h-3 w-3" /> أسبوعي
            </Button>
          </div>
        </div>

        {/* Period nav */}
        <div className="flex items-center justify-between mt-3">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigatePeriod(-1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">{periodLabel}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setCursor(new Date());
                setSelectedDay(new Date());
              }}
            >
              اليوم
            </Button>
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigatePeriod(1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground border-b pb-1">
          {ARABIC_DAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        {/* Grid */}
        <AnimatePresence mode="wait">
          {view === "month" ? (
            <motion.div
              key="month"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-7 gap-1"
            >
              {monthCells.map((date, i) => {
                if (!date) return <div key={i} className="aspect-square" />;
                const sessions = getCellSessions(date);
                const isToday = sameDay(date, today);
                const isSelected = selectedDay && sameDay(date, selectedDay);
                const isPast = date < new Date(today.toDateString());
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(date)}
                    className={`aspect-square rounded-lg border p-1 text-xs flex flex-col items-center justify-start transition-all hover:bg-muted/50 ${
                      isSelected
                        ? "ring-2 ring-primary bg-primary/5 border-primary/30"
                        : isToday
                        ? "border-secondary/50 bg-secondary/5"
                        : "border-border/40"
                    } ${isPast ? "opacity-50" : ""}`}
                  >
                    <span className={`font-bold ${isToday ? "text-secondary" : "text-foreground"}`}>
                      {date.getDate()}
                    </span>
                    {sessions.length > 0 && (
                      <div className="flex gap-0.5 mt-1 flex-wrap justify-center">
                        {sessions.slice(0, 3).map((s) => {
                          const live = s.session_status === "in_progress";
                          return (
                            <span
                              key={s.id}
                              className={`w-1.5 h-1.5 rounded-full ${
                                live ? "bg-secondary animate-pulse" : "bg-primary"
                              }`}
                            />
                          );
                        })}
                        {sessions.length > 3 && (
                          <span className="text-[9px] text-muted-foreground">+{sessions.length - 3}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              key="week"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-7 gap-1"
            >
              {weekDays.map((date, i) => {
                const sessions = getCellSessions(date);
                const isToday = sameDay(date, today);
                const isSelected = selectedDay && sameDay(date, selectedDay);
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(date)}
                    className={`min-h-[110px] rounded-lg border p-2 text-right transition-all hover:bg-muted/50 ${
                      isSelected
                        ? "ring-2 ring-primary bg-primary/5 border-primary/30"
                        : isToday
                        ? "border-secondary/50 bg-secondary/5"
                        : "border-border/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground">
                        {date.getDate()}/{date.getMonth() + 1}
                      </span>
                      {isToday && (
                        <Badge className="bg-secondary/15 text-secondary border-0 text-[9px] h-4 px-1">
                          اليوم
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {sessions.slice(0, 3).map((s) => {
                        const live = s.session_status === "in_progress";
                        return (
                          <div
                            key={s.id}
                            className={`text-[9px] rounded px-1 py-0.5 truncate ${
                              live
                                ? "bg-secondary/20 text-secondary"
                                : "bg-primary/10 text-primary"
                            }`}
                          >
                            {new Date(s.scheduled_at).toLocaleTimeString("ar-SA", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            {s.subject_name}
                          </div>
                        );
                      })}
                      {sessions.length > 3 && (
                        <div className="text-[9px] text-muted-foreground">+{sessions.length - 3}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Selected day sessions list */}
        {selectedDay && (
          <div className="border-t pt-3">
            <div className="flex items-center gap-2 mb-2">
              <List className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-foreground">
                حصص {ARABIC_DAYS[selectedDay.getDay()]} {selectedDay.getDate()} {ARABIC_MONTHS[selectedDay.getMonth()]}
              </span>
              <Badge variant="outline" className="text-[10px]">{selectedSessions.length}</Badge>
            </div>

            {selectedSessions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                لا توجد حصص في هذا اليوم
              </p>
            ) : (
              <div className="space-y-2">
                {selectedSessions.map((s) => {
                  const startMs = new Date(s.scheduled_at).getTime();
                  const diff = startMs - now;
                  const live = s.session_status === "in_progress";
                  const joinable = diff <= 10 * 60_000 && diff >= -30 * 60_000;
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border ${
                        live
                          ? "bg-secondary/5 border-secondary/30"
                          : "bg-muted/30 border-border/40"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">
                          {s.other_name} — {s.subject_name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(s.scheduled_at).toLocaleTimeString("ar-SA", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          • {s.duration_minutes} د
                        </p>
                      </div>
                      {live ? (
                        <Button
                          size="sm"
                          className="h-8 gradient-cta text-secondary-foreground gap-1"
                          onClick={() => navigate(`/session?booking=${s.id}`)}
                        >
                          <Video className="h-3.5 w-3.5" /> انضم
                        </Button>
                      ) : joinable ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1 border-secondary/40 text-secondary"
                          onClick={() => navigate(`/session?booking=${s.id}`)}
                        >
                          <Video className="h-3.5 w-3.5" /> ابدأ
                        </Button>
                      ) : (
                        <Badge className="bg-primary/10 text-primary border-0 text-[10px]">
                          مجدولة
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
