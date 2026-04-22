import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, Loader2, Video, Bell, BookOpen, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface UpcomingRow {
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

const formatCountdown = (ms: number) => {
  if (ms <= 0) return "حان الآن";
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `بعد ${days} يوم ${hours} س`;
  if (hours > 0) return `بعد ${hours} س ${mins} د`;
  if (mins > 0) return `بعد ${mins} دقيقة`;
  const secs = Math.max(0, Math.floor(ms / 1000));
  return `بعد ${secs} ث`;
};

const formatDateAr = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("ar-SA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function UpcomingSessionsTable({ role }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { play } = useNotificationSound();
  const [rows, setRows] = useState<UpcomingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Persist notified-once IDs in localStorage per user — survives reloads / new tabs.
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
      .gte("scheduled_at", new Date(Date.now() - 30 * 60_000).toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(50);

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
      .channel(`upcoming-sessions-${role}-${user.id}`)
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

  // Trigger 1-hour-before reminder per session (once per browser session)
  useEffect(() => {
    if (!user) return;
    rows.forEach(async (r) => {
      const diff = new Date(r.scheduled_at).getTime() - Date.now();
      if (diff > 0 && diff <= 60 * 60_000 && !notifiedIds.has(r.id)) {
        notifiedIds.add(r.id);
        try {
          sessionStorage.setItem("upcoming_hour_notified", JSON.stringify([...notifiedIds]));
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
            body: `حصة ${r.subject_name} مع ${r.other_name} في ${formatDateAr(r.scheduled_at)}`,
            type: "session_reminder",
          });
        } catch {}
      }
    });
  }, [rows, now, user, notifiedIds, play]);

  const enriched = useMemo(
    () =>
      rows.map((r) => {
        const startMs = new Date(r.scheduled_at).getTime();
        const diff = startMs - now;
        const live = r.session_status === "in_progress";
        const joinable = diff <= 10 * 60_000 && diff >= -30 * 60_000; // 10 min before to 30 min after
        const soon = diff > 0 && diff <= 60 * 60_000;
        return { ...r, diff, live, joinable, soon };
      }),
    [rows, now]
  );

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
            <CalendarClock className="h-4 w-4 text-primary" />
          </div>
          جدول الحصص المجدولة
          {enriched.length > 0 && (
            <Badge className="mr-auto bg-primary/10 text-primary border-0 text-xs">
              {enriched.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {enriched.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <CalendarClock className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">لا توجد حصص قادمة حاليًا</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border/50">
                  <th className="px-3 py-2 text-right font-semibold">{role === "student" ? "المعلم" : "الطالب"}</th>
                  <th className="px-3 py-2 text-right font-semibold">المادة</th>
                  <th className="px-3 py-2 text-right font-semibold">الموعد</th>
                  <th className="px-3 py-2 text-right font-semibold">المدة</th>
                  <th className="px-3 py-2 text-right font-semibold">العدّاد</th>
                  <th className="px-3 py-2 text-right font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {enriched.map((r) => (
                    <motion.tr
                      key={r.id}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={`border-b border-border/30 transition-colors hover:bg-muted/30 ${
                        r.live ? "bg-secondary/5" : r.soon ? "bg-amber-500/5" : ""
                      }`}
                    >
                      <td className="px-3 py-2.5 font-semibold text-foreground">{r.other_name}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <BookOpen className="h-3.5 w-3.5" />
                          {r.subject_name}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">
                        {formatDateAr(r.scheduled_at)}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{r.duration_minutes} د</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`text-xs font-bold ${
                            r.live
                              ? "text-secondary animate-pulse"
                              : r.soon
                              ? "text-amber-600"
                              : "text-muted-foreground"
                          }`}
                        >
                          {r.live ? "🔴 جارية" : formatCountdown(r.diff)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {r.live ? (
                          <Button
                            size="sm"
                            className="h-8 px-3 gradient-cta text-secondary-foreground rounded-lg gap-1"
                            onClick={() => navigate(`/session?booking=${r.id}`)}
                          >
                            <Video className="h-3.5 w-3.5" /> انضم الآن
                          </Button>
                        ) : r.joinable ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-3 rounded-lg gap-1 border-secondary/40 text-secondary hover:bg-secondary/10"
                            onClick={() => navigate(`/session?booking=${r.id}`)}
                          >
                            <Video className="h-3.5 w-3.5" /> ابدأ
                          </Button>
                        ) : r.soon ? (
                          <Badge className="bg-amber-500/15 text-amber-600 border-0 text-[10px] gap-1">
                            <Bell className="h-3 w-3" /> قريبًا
                          </Badge>
                        ) : (
                          <Badge className="bg-primary/10 text-primary border-0 text-[10px]">
                            مجدولة
                          </Badge>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
