import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, CalendarClock, Search, RadioTower } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Tab = "past" | "live" | "upcoming";

interface Row {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  session_status?: string | null;
  student_id: string;
  teacher_id: string;
  student_name: string;
  teacher_name: string;
  subject_name: string;
  cancellation_reason?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  actual_duration_minutes?: number | null;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: "قيد الانتظار", color: "bg-amber-500/15 text-amber-600" },
  confirmed: { label: "مؤكدة", color: "bg-secondary/15 text-secondary" },
  in_progress: { label: "🔴 جارية", color: "bg-secondary/15 text-secondary" },
  completed: { label: "مكتملة", color: "bg-primary/15 text-primary" },
  cancelled: { label: "تم الإلغاء", color: "bg-destructive/15 text-destructive" },
};

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function LiveCounter({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return (
    <span className="inline-flex items-center gap-1.5 font-mono font-bold text-secondary">
      <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
      {formatDuration(elapsed)}
    </span>
  );
}

const PAGE_SIZE = 100;

export default function SessionsStatusTab() {
  const [activeTab, setActiveTab] = useState<Tab>("live");

  // Per-tab cached data + loading flags
  const [data, setData] = useState<Record<Tab, Row[]>>({ live: [], upcoming: [], past: [] });
  const [loaded, setLoaded] = useState<Record<Tab, boolean>>({ live: false, upcoming: false, past: false });
  const [tabLoading, setTabLoading] = useState(false);
  const [counts, setCounts] = useState<{ live: number; upcoming: number; past: number }>({ live: 0, upcoming: 0, past: 0 });

  // Filters
  const [filterDate, setFilterDate] = useState("");
  const [filterStudent, setFilterStudent] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Throttle refetch from realtime to once per 4s per tab
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCounts = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const [{ count: liveCount }, { count: upcomingCount }, { count: pastCount }] = await Promise.all([
      // LIVE = strictly in_progress AND not yet completed/cancelled
      supabase.from("bookings").select("id", { count: "exact", head: true })
        .eq("session_status", "in_progress")
        .not("status", "in", "(completed,cancelled)"),
      // UPCOMING = scheduled in the future, NOT live, NOT completed/cancelled
      supabase.from("bookings").select("id", { count: "exact", head: true })
        .in("status", ["confirmed", "pending"])
        .neq("session_status", "in_progress")
        .neq("session_status", "completed")
        .gte("scheduled_at", nowIso),
      // PAST = completed/cancelled OR session already ended
      supabase.from("bookings").select("id", { count: "exact", head: true })
        .or("status.in.(completed,cancelled),session_status.eq.completed"),
    ]);
    setCounts({ live: liveCount ?? 0, upcoming: upcomingCount ?? 0, past: pastCount ?? 0 });
  }, []);

  const fetchTab = useCallback(async (tab: Tab, force = false) => {
    if (loaded[tab] && !force) return;
    setTabLoading(true);

    const nowIso = new Date().toISOString();
    let q = supabase
      .from("bookings")
      .select("id, scheduled_at, duration_minutes, status, session_status, student_id, teacher_id, subject_id, cancellation_reason, subjects(name)")
      .order("scheduled_at", { ascending: tab === "upcoming" })
      .limit(PAGE_SIZE);

    if (tab === "live") {
      q = q
        .eq("session_status", "in_progress")
        .not("status", "in", "(completed,cancelled)");
    } else if (tab === "upcoming") {
      q = q
        .in("status", ["confirmed", "pending"])
        .neq("session_status", "in_progress")
        .neq("session_status", "completed")
        .gte("scheduled_at", nowIso);
    } else {
      q = q.or("status.in.(completed,cancelled),session_status.eq.completed");
    }

    const { data: bookings } = await q;
    if (!bookings || bookings.length === 0) {
      setData(prev => ({ ...prev, [tab]: [] }));
      setLoaded(prev => ({ ...prev, [tab]: true }));
      setTabLoading(false);
      return;
    }

    const userIds = [...new Set([...bookings.map(b => b.student_id), ...bookings.map(b => b.teacher_id)])];
    const bookingIds = bookings.map(b => b.id);

    // For "upcoming" we don't need sessions data → skip that query
    const profilesPromise = Promise.resolve(
      supabase.from("profiles").select("user_id, full_name").in("user_id", userIds)
    );
    const sessionsPromise = tab !== "upcoming"
      ? Promise.resolve(supabase.from("sessions").select("booking_id, started_at, ended_at, duration_minutes").in("booking_id", bookingIds))
      : Promise.resolve({ data: [] as any[] });

    const [profilesRes, sessionsRes] = await Promise.all([profilesPromise, sessionsPromise]);
    const profiles = (profilesRes as any)?.data ?? [];
    const sessions = ((sessionsRes as any)?.data ?? []) as any[];

    const nameMap = new Map<string, string>(profiles.map((p: any) => [p.user_id, p.full_name as string]));
    const sessionMap = new Map(sessions.map((s: any) => [s.booking_id, s]));

    const rows: Row[] = bookings.map((b: any) => {
      const sess = sessionMap.get(b.id);
      return {
        id: b.id,
        scheduled_at: b.scheduled_at,
        duration_minutes: b.duration_minutes,
        status: b.status,
        session_status: b.session_status,
        student_id: b.student_id,
        teacher_id: b.teacher_id,
        student_name: nameMap.get(b.student_id) || "—",
        teacher_name: nameMap.get(b.teacher_id) || "—",
        subject_name: b.subjects?.name || "—",
        cancellation_reason: b.cancellation_reason,
        started_at: sess?.started_at || null,
        ended_at: sess?.ended_at || null,
        actual_duration_minutes: sess?.duration_minutes ?? null,
      };
    });

    setData(prev => ({ ...prev, [tab]: rows }));
    setLoaded(prev => ({ ...prev, [tab]: true }));
    setTabLoading(false);
  }, [loaded]);

  // Initial: counts + load active tab only
  useEffect(() => {
    fetchCounts();
    fetchTab(activeTab);

    const ch = supabase
      .channel("admin-sessions-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        // Throttle refetch (snappier — every 1.2s)
        if (refetchTimerRef.current) return;
        refetchTimerRef.current = setTimeout(() => {
          fetchCounts();
          // Invalidate all loaded tabs so the user sees the latest on switch
          setLoaded({ live: false, upcoming: false, past: false });
          fetchTab(activeTab, true);
          refetchTimerRef.current = null;
        }, 1200);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, () => {
        if (refetchTimerRef.current) return;
        refetchTimerRef.current = setTimeout(() => {
          fetchCounts();
          setLoaded({ live: false, upcoming: false, past: false });
          fetchTab(activeTab, true);
          refetchTimerRef.current = null;
        }, 1200);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load tab data on switch (cached after first load)
  useEffect(() => {
    setFilterDate(""); setFilterStudent(""); setFilterTeacher(""); setFilterStatus("all");
    fetchTab(activeTab);
  }, [activeTab, fetchTab]);

  const filtered = useMemo(() => {
    const list = data[activeTab];
    return list.filter(r => {
      if (filterDate) {
        const d = new Date(r.scheduled_at).toISOString().slice(0, 10);
        if (d !== filterDate) return false;
      }
      if (filterStudent && !r.student_name.toLowerCase().includes(filterStudent.toLowerCase())) return false;
      if (filterTeacher && !r.teacher_name.toLowerCase().includes(filterTeacher.toLowerCase())) return false;
      if (filterStatus !== "all") {
        const effective = r.session_status === "in_progress" ? "in_progress" : r.status;
        if (effective !== filterStatus) return false;
      }
      return true;
    });
  }, [data, activeTab, filterDate, filterStudent, filterTeacher, filterStatus]);

  return (
    <Card className="border-0 shadow-card">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <RadioTower className="h-4 w-4 text-primary" />
          </div>
          حالات الجلسات
          <Badge variant="outline" className="text-[10px]">
            {counts.live} جارية • {counts.upcoming} قادمة • {counts.past} سابقة
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)} dir="rtl">
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="live" className="gap-2"><RadioTower className="h-4 w-4" /> الجارية ({counts.live})</TabsTrigger>
            <TabsTrigger value="upcoming" className="gap-2"><CalendarClock className="h-4 w-4" /> القادمة ({counts.upcoming})</TabsTrigger>
            <TabsTrigger value="past" className="gap-2"><CheckCircle2 className="h-4 w-4" /> السابقة ({counts.past})</TabsTrigger>
          </TabsList>

          {/* Filters */}
          <div className="grid md:grid-cols-4 gap-2 mb-3">
            <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} placeholder="التاريخ" />
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pr-8" placeholder="اسم الطالب" value={filterStudent} onChange={e => setFilterStudent(e.target.value)} />
            </div>
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pr-8" placeholder="اسم المعلم" value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)} />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {activeTab === "live" && <SelectItem value="in_progress">🔴 جارية</SelectItem>}
                {activeTab === "upcoming" && <>
                  <SelectItem value="confirmed">مؤكدة</SelectItem>
                  <SelectItem value="pending">قيد الانتظار</SelectItem>
                </>}
                {activeTab === "past" && <>
                  <SelectItem value="completed">مكتملة</SelectItem>
                  <SelectItem value="cancelled">تم الإلغاء</SelectItem>
                </>}
              </SelectContent>
            </Select>
          </div>

          <TabsContent value={activeTab} className="mt-0">
            {tabLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs">
                    <tr>
                      <th className="text-right py-2 px-3">التاريخ</th>
                      <th className="text-right py-2 px-3">الوقت</th>
                      <th className="text-right py-2 px-3">الطالب</th>
                      <th className="text-right py-2 px-3">المعلم</th>
                      <th className="text-right py-2 px-3">المادة</th>
                      <th className="text-right py-2 px-3">المدة</th>
                      <th className="text-right py-2 px-3">{activeTab === "live" ? "العداد" : "الحالة"}</th>
                      {activeTab === "live" && <th className="text-right py-2 px-3">الحالة</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={activeTab === "live" ? 8 : 7} className="text-center py-8 text-muted-foreground">لا توجد جلسات</td></tr>
                    ) : filtered.map(r => {
                      const d = new Date(r.scheduled_at);
                      const effectiveStatus = r.session_status === "in_progress" ? "in_progress" : r.status;
                      const sl = STATUS_LABEL[effectiveStatus] || { label: effectiveStatus, color: "bg-muted text-muted-foreground" };
                      const durationLabel = r.actual_duration_minutes != null
                        ? `${r.actual_duration_minutes} د (فعلي)`
                        : `${r.duration_minutes} د`;
                      return (
                        <tr key={r.id} className="border-t hover:bg-muted/20">
                          <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{d.toLocaleDateString("ar-SA")}</td>
                          <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="py-2 px-3 font-semibold">{r.student_name}</td>
                          <td className="py-2 px-3 font-semibold">{r.teacher_name}</td>
                          <td className="py-2 px-3 text-muted-foreground">{r.subject_name}</td>
                          <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{durationLabel}</td>
                          {activeTab === "live" ? (
                            <>
                              <td className="py-2 px-3">{r.started_at ? <LiveCounter startedAt={r.started_at} /> : <span className="text-muted-foreground text-xs">لم تبدأ</span>}</td>
                              <td className="py-2 px-3"><Badge className={`${sl.color} border-0 text-[10px]`}>{sl.label}</Badge></td>
                            </>
                          ) : (
                            <td className="py-2 px-3">
                              <Badge className={`${sl.color} border-0 text-[10px]`}>{sl.label}</Badge>
                              {effectiveStatus === "cancelled" && r.cancellation_reason && (
                                <p className="text-[10px] text-muted-foreground mt-1 max-w-[200px] truncate" title={r.cancellation_reason}>
                                  السبب: {r.cancellation_reason}
                                </p>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
