import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarCheck, Loader2, MessageSquare, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { toast } from "sonner";

interface BookingRow {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  session_status?: string | null;
  teacher_name?: string;
  subject_name?: string;
  teacher_id?: string;
}

export default function StudentScheduleTable() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveSessionIds, setLiveSessionIds] = useState<Set<string>>(new Set());
  const bookingIds = useMemo(() => bookings.map(b => b.id), [bookings]);
  const unreadCounts = useUnreadMessages(bookingIds);
  const { play: playNotificationSound } = useNotificationSound();

  useEffect(() => {
    if (!user) return;
    fetchBookings();

    const channel = supabase
      .channel("student-schedule-table")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `student_id=eq.${user.id}` }, (payload) => {
        const updated = payload.new as any;
        if (updated?.session_status === "in_progress") {
          setLiveSessionIds(prev => {
            if (!prev.has(updated.id)) {
              playNotificationSound();
              toast.success("🎓 المعلم بدأ الحصة! انضم الآن", { duration: 10000 });
            }
            return new Set(prev).add(updated.id);
          });
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
      .select("id, scheduled_at, duration_minutes, status, session_status, teacher_id, subject_id, subjects(name)")
      .eq("student_id", user.id)
      .in("status", ["confirmed", "completed", "pending"])
      .order("scheduled_at", { ascending: true });

    if (!data || data.length === 0) { setBookings([]); setLoading(false); return; }

    const teacherIds = [...new Set(data.map(b => b.teacher_id))];
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", teacherIds);
    const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));

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
    })));
    setLoading(false);
  };

  const getStatusBadge = (status: string, isLive: boolean) => {
    if (isLive) return <Badge className="bg-secondary/10 text-secondary border-0 text-[10px] animate-pulse">🔴 جارية الآن</Badge>;
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
      <CardContent>
        {bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">لا توجد حصص</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-right py-2 px-2 text-xs font-bold text-muted-foreground">المعلم</th>
                  <th className="text-right py-2 px-2 text-xs font-bold text-muted-foreground">المادة</th>
                  <th className="text-right py-2 px-2 text-xs font-bold text-muted-foreground">التاريخ</th>
                  <th className="text-right py-2 px-2 text-xs font-bold text-muted-foreground">الوقت</th>
                  <th className="text-right py-2 px-2 text-xs font-bold text-muted-foreground">المدة</th>
                  <th className="text-right py-2 px-2 text-xs font-bold text-muted-foreground">الحالة</th>
                  <th className="text-right py-2 px-2 text-xs font-bold text-muted-foreground">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => {
                  const isLive = liveSessionIds.has(b.id);
                  return (
                    <tr
                      key={b.id}
                      className={`border-b border-border/30 transition-colors ${
                        isLive ? "bg-secondary/5" : b.status === "completed" ? "bg-destructive/5" : "hover:bg-muted/50"
                      }`}
                    >
                      <td className="py-2.5 px-2 font-medium text-foreground">{b.teacher_name}</td>
                      <td className="py-2.5 px-2 text-muted-foreground">{b.subject_name}</td>
                      <td className="py-2.5 px-2 text-muted-foreground">{new Date(b.scheduled_at).toLocaleDateString("ar-SA")}</td>
                      <td className="py-2.5 px-2 text-muted-foreground">{new Date(b.scheduled_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="py-2.5 px-2 text-muted-foreground">{b.duration_minutes} د</td>
                      <td className="py-2.5 px-2">{getStatusBadge(b.status, isLive)}</td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" className="rounded-lg h-7 px-2 gap-1 text-[10px] relative" asChild>
                            <Link to={`/chat?booking=${b.id}`}>
                              <MessageSquare className="h-3.5 w-3.5" />
                              دردشة
                              {(unreadCounts[b.id] || 0) > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[8px] flex items-center justify-center font-bold">
                                  {unreadCounts[b.id]}
                                </span>
                              )}
                            </Link>
                          </Button>
                          {isLive ? (
                            <Button size="sm" className="gradient-cta text-secondary-foreground rounded-lg h-7 px-2 gap-1 text-[10px] shadow-button animate-pulse" asChild>
                              <Link to={`/session?booking=${b.id}`}>
                                <Video className="h-3.5 w-3.5" />
                                انضم الآن
                              </Link>
                            </Button>
                          ) : (b.status === "confirmed" || b.status === "pending") ? (
                            <Button size="sm" className="gradient-cta text-secondary-foreground rounded-lg h-7 px-2 gap-1 text-[10px] shadow-button" asChild>
                              <Link to={`/session?booking=${b.id}`}>
                                <Video className="h-3.5 w-3.5" />
                                ابدأ
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
