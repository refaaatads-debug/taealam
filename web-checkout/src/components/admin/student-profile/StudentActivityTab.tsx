import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Activity, LogIn, Bell, AlertCircle } from "lucide-react";
import type { StudentBundle } from "@/pages/AdminStudentProfile";

const StudentActivityTab = ({ data }: { data: StudentBundle }) => {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    if (!data.profile?.user_id) return;
    supabase
      .from("session_events")
      .select("*")
      .eq("user_id", data.profile.user_id)
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data: rows }) => setEvents(rows || []));
  }, [data.profile?.user_id]);

  const eventIcon = (t: string) => {
    if (t === "login") return <LogIn className="h-3.5 w-3.5 text-emerald-500" />;
    if (t === "session_join") return <Activity className="h-3.5 w-3.5 text-sky-500" />;
    return <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const eventLabel = (t: string) => ({
    login: "تسجيل دخول",
    logout: "تسجيل خروج",
    session_join: "انضمام لحصة",
    session_leave: "مغادرة حصة",
  } as Record<string, string>)[t] || t;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">عدد الأحداث</div><div className="text-2xl font-bold">{events.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">مرات الدخول</div><div className="text-2xl font-bold text-emerald-600">{events.filter((e: any) => e.event_type === "login").length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">إشعارات مرسلة</div><div className="text-2xl font-bold">{data.notifications.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">آخر نشاط</div><div className="text-sm font-bold">{events[0]?.created_at ? new Date(events[0].created_at).toLocaleDateString("ar-SA") : "—"}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <h3 className="font-bold mb-3 text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> سجل النشاط</h3>
            {events.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">لا يوجد نشاط مسجّل</div>
            ) : (
              <ul className="space-y-2 max-h-96 overflow-y-auto">
                {events.map((e: any) => (
                  <li key={e.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/40 text-xs">
                    {eventIcon(e.event_type)}
                    <span className="flex-1">{eventLabel(e.event_type)}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(e.created_at).toLocaleString("ar-SA")}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="font-bold mb-3 text-sm flex items-center gap-2"><Bell className="h-4 w-4 text-primary" /> الإشعارات</h3>
            {data.notifications.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">لا توجد إشعارات</div>
            ) : (
              <ul className="space-y-2 max-h-96 overflow-y-auto">
                {data.notifications.slice(0, 30).map((n: any) => (
                  <li key={n.id} className="p-2 rounded-md bg-muted/40 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold truncate">{n.title}</span>
                      {!n.is_read && <Badge variant="outline" className="text-[9px] bg-primary/10">جديد</Badge>}
                    </div>
                    {n.body && <p className="text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>}
                    <div className="text-[10px] text-muted-foreground/70 mt-1">{new Date(n.created_at).toLocaleString("ar-SA")}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StudentActivityTab;
