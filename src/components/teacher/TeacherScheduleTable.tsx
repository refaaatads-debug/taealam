import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarCheck, Loader2, MessageSquare, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";

interface BookingRow {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  student_name?: string;
  subject_name?: string;
  student_id?: string;
  has_subscription?: boolean;
}

export default function TeacherScheduleTable() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);

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
      .order("scheduled_at", { ascending: true });

    if (!data || data.length === 0) { setBookings([]); setLoading(false); return; }

    const studentIds = [...new Set(data.map(b => b.student_id))];
    const [{ data: profiles }, { data: subs }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name").in("user_id", studentIds),
      supabase.from("user_subscriptions").select("user_id, sessions_remaining, is_active").in("user_id", studentIds).eq("is_active", true),
    ]);
    const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));
    const subSet = new Set((subs ?? []).filter(s => s.sessions_remaining > 0).map(s => s.user_id));

    setBookings(data.map(b => ({
      id: b.id,
      scheduled_at: b.scheduled_at,
      duration_minutes: b.duration_minutes,
      status: b.status,
      student_id: b.student_id,
      student_name: profileMap.get(b.student_id) || "طالب",
      subject_name: (b.subjects as any)?.name || "مادة",
      has_subscription: subSet.has(b.student_id),
    })));
    setLoading(false);
  };

  const isToday = (dateStr: string) => new Date(dateStr).toDateString() === new Date().toDateString();

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
                  <th className="text-right py-2 px-2 text-xs font-bold text-muted-foreground">الطالب</th>
                  <th className="text-right py-2 px-2 text-xs font-bold text-muted-foreground">المادة</th>
                  <th className="text-right py-2 px-2 text-xs font-bold text-muted-foreground">التاريخ</th>
                  <th className="text-right py-2 px-2 text-xs font-bold text-muted-foreground">الوقت</th>
                  <th className="text-right py-2 px-2 text-xs font-bold text-muted-foreground">المدة</th>
                  <th className="text-right py-2 px-2 text-xs font-bold text-muted-foreground">الحالة</th>
                  <th className="text-right py-2 px-2 text-xs font-bold text-muted-foreground">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr
                    key={b.id}
                    className={`border-b border-border/30 transition-colors ${
                      b.status === "completed" ? "bg-destructive/5" : "hover:bg-muted/50"
                    }`}
                  >
                    <td className="py-2.5 px-2 font-medium text-foreground">{b.student_name}</td>
                    <td className="py-2.5 px-2 text-muted-foreground">{b.subject_name}</td>
                    <td className="py-2.5 px-2 text-muted-foreground">{new Date(b.scheduled_at).toLocaleDateString("ar-SA")}</td>
                    <td className="py-2.5 px-2 text-muted-foreground">{new Date(b.scheduled_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="py-2.5 px-2 text-muted-foreground">{b.duration_minutes} د</td>
                    <td className="py-2.5 px-2">{getStatusBadge(b.status)}</td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-1.5">
                        {b.status !== "completed" && (
                          <Button size="sm" variant="outline" className="rounded-lg h-7 px-2 gap-1 text-[10px]" asChild>
                            <Link to={`/chat?booking=${b.id}`}>
                              <MessageSquare className="h-3.5 w-3.5" />
                              دردشة
                            </Link>
                          </Button>
                        )}
                        {b.status === "confirmed" && (
                          <Button size="sm" className="gradient-cta text-secondary-foreground rounded-lg h-7 px-2 gap-1 text-[10px] shadow-button" asChild>
                            <Link to={`/session?booking=${b.id}`}>
                              <Video className="h-3.5 w-3.5" />
                              ابدأ
                            </Link>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
