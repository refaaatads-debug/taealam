import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Calendar, Clock, ExternalLink, Search, User } from "lucide-react";
import type { StudentBundle } from "@/pages/AdminStudentProfile";

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

const StudentSessionsTab = ({ data }: { data: StudentBundle }) => {
  const [filter, setFilter] = useState<"all" | "upcoming" | "past" | "cancelled">("all");
  const [search, setSearch] = useState("");
  const [teacherNames, setTeacherNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const ids = Array.from(new Set(data.bookings.map((b: any) => b.teacher_id).filter(Boolean)));
    if (ids.length === 0) return;
    supabase.from("profiles").select("user_id, full_name").in("user_id", ids).then(({ data: rows }) => {
      const m: Record<string, string> = {};
      (rows || []).forEach((r: any) => { m[r.user_id] = r.full_name; });
      setTeacherNames(m);
    });
  }, [data.bookings]);

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
      const sub = (b.subjects?.name || "").toLowerCase();
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
          {filtered.map((b: any) => (
            <Card key={b.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <BookOpen className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="font-bold text-sm">{b.subjects?.name || "بدون مادة"}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" /> {teacherNames[b.teacher_id] || "معلم"}
                      </div>
                    </div>
                  </div>
                  {statusBadge(b.status)}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(b.scheduled_at).toLocaleString("ar-SA")}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{b.duration_minutes} دقيقة</span>
                  {b.price && <span>{b.price} ريال</span>}
                  {b.cancellation_reason && <span className="text-destructive">سبب الإلغاء: {b.cancellation_reason}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentSessionsTab;
