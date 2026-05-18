import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Calendar, Clock, LogIn, Search, Timer, User } from "lucide-react";
import type { StudentBundle } from "@/pages/AdminStudentProfile";

const getActualMinutes = (session: any): number => {
  if (!session) return 0;
  if (session.deducted_minutes > 0) return session.deducted_minutes;
  if (session.duration_seconds > 0) return Math.ceil(session.duration_seconds / 60);
  if (session.started_at && session.ended_at) {
    const secs = (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000;
    if (secs >= 60) return Math.ceil(secs / 60);
  }
  if (session.duration_minutes > 0) return session.duration_minutes;
  return 0;
};

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; cls: string }> = {
    completed: { label: "مكتملة", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
    confirmed: { label: "مؤكدة", cls: "bg-sky-500/15 text-sky-600 border-sky-500/30" },
    pending: { label: "قيد الانتظار", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
    cancelled: { label: "ملغاة", cls: "bg-destructive/15 text-destructive border-destructive/30" },
    no_show: { label: "غياب", cls: "bg-orange-500/15 text-orange-600 border-orange-500/30" },
  };
  const m = map[status] || { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return <Badge variant="outline" className={m.cls}>{m.label}</Badge>;
};

const fmt = (iso: string | null | undefined, type: "date" | "time") => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (type === "date") return d.toLocaleDateString("ar-SA");
  return d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
};

const StudentSessionsTab = ({ data }: { data: StudentBundle }) => {
  const [filter, setFilter] = useState<"all" | "upcoming" | "past" | "cancelled">("all");
  const [search, setSearch] = useState("");
  const [teacherNames, setTeacherNames] = useState<Record<string, string>>({});
  const [subjectNames, setSubjectNames] = useState<Record<string, string>>({});

  const sessionsMap = useMemo(() => {
    const m: Record<string, any> = {};
    (data.sessions || []).forEach((s: any) => { m[s.booking_id] = s; });
    return m;
  }, [data.sessions]);

  useEffect(() => {
    // Fetch teacher names
    const tids = Array.from(new Set(data.bookings.map((b: any) => b.teacher_id).filter(Boolean)));
    if (tids.length > 0) {
      supabase.from("profiles").select("user_id, full_name").in("user_id", tids).then(({ data: rows }) => {
        const m: Record<string, string> = {};
        (rows || []).forEach((r: any) => { m[r.user_id] = r.full_name; });
        setTeacherNames(m);
      });
    }
    // Fetch all subjects as a lookup map
    supabase.from("subjects").select("id, name").then(({ data: rows }) => {
      const m: Record<string, string> = {};
      (rows || []).forEach((r: any) => { m[r.id] = r.name; });
      setSubjectNames(m);
    });
  }, [data.bookings]);

  const getSubjectName = (b: any): string => {
    if (b.subject_id && subjectNames[b.subject_id]) return subjectNames[b.subject_id];
    if (b.subjects?.name) return b.subjects.name;
    if (Array.isArray(b.subjects) && b.subjects[0]?.name) return b.subjects[0].name;
    return "بدون مادة";
  };

  const filtered = data.bookings.filter((b: any) => {
    const isUpcoming = new Date(b.scheduled_at) > new Date() && (b.status === "confirmed" || b.status === "pending");
    const isPast = b.status === "completed" || b.status === "no_show";
    const isCancel = b.status === "cancelled";
    if (filter === "upcoming" && !isUpcoming) return false;
    if (filter === "past" && !isPast) return false;
    if (filter === "cancelled" && !isCancel) return false;
    if (search) {
      const q = search.toLowerCase();
      const tn = (teacherNames[b.teacher_id] || "").toLowerCase();
      const sub = getSubjectName(b).toLowerCase();
      if (!tn.includes(q) && !sub.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "upcoming", "past", "cancelled"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "all" ? "الكل" : f === "upcoming" ? "قادمة" : f === "past" ? "سابقة" : "ملغاة"}
          </Button>
        ))}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالمعلم أو المادة" className="pr-8 h-9" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />لا توجد حصص بهذا الفلتر</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((b: any) => {
            const session = sessionsMap[b.id] || null;
            const actualMins = getActualMinutes(session);
            const subjectName = getSubjectName(b);
            const teacherName = teacherNames[b.teacher_id] || "معلم";
            const isShort = session && actualMins > 0 && actualMins < 5;
            const hasSubject = b.subject_id && subjectNames[b.subject_id];

            return (
              <Card key={b.id} className="border border-border/50">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <BookOpen className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <div className={`font-bold text-sm ${!hasSubject ? "text-muted-foreground italic" : ""}`}>
                          {subjectName}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" /> {teacherName}
                        </div>
                      </div>
                    </div>
                    {statusBadge(b.status)}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-muted/40 rounded-lg px-2.5 py-2">
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                        <Calendar className="h-3 w-3" /> التاريخ
                      </div>
                      <p className="text-xs font-bold text-foreground">{fmt(b.scheduled_at, "date")}</p>
                      <p className="text-[10px] text-muted-foreground">{fmt(b.scheduled_at, "time")}</p>
                    </div>

                    <div className="bg-muted/40 rounded-lg px-2.5 py-2">
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                        <LogIn className="h-3 w-3" /> وقت الدخول
                      </div>
                      <p className="text-xs font-bold text-foreground">
                        {session?.started_at ? fmt(session.started_at, "time") : "—"}
                      </p>
                      {session?.ended_at && (
                        <p className="text-[10px] text-muted-foreground">خروج: {fmt(session.ended_at, "time")}</p>
                      )}
                    </div>

                    <div className="bg-muted/40 rounded-lg px-2.5 py-2">
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                        <Clock className="h-3 w-3" /> المدة المحجوزة
                      </div>
                      <p className="text-xs font-bold text-foreground">{b.duration_minutes} دقيقة</p>
                    </div>

                    <div className={`rounded-lg px-2.5 py-2 ${actualMins > 0 ? (isShort ? "bg-amber-500/10" : "bg-emerald-500/10") : "bg-muted/40"}`}>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                        <Timer className="h-3 w-3" /> المدة الفعلية
                      </div>
                      {actualMins > 0 ? (
                        <>
                          <p className={`text-xs font-black ${isShort ? "text-amber-600" : "text-emerald-600"}`}>
                            {actualMins} دقيقة
                          </p>
                          {isShort && <p className="text-[10px] text-amber-600">أقل من 5 د</p>}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground/60">—</p>
                      )}
                    </div>
                  </div>

                  {b.cancellation_reason && (
                    <p className="text-xs text-destructive bg-destructive/5 rounded-lg px-2 py-1">
                      سبب الإلغاء: {b.cancellation_reason}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentSessionsTab;
