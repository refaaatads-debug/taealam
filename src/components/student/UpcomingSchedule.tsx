import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Video, MessageSquare, X, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  upcomingClasses: any[];
  onRefresh?: () => void;
}

export default function UpcomingSchedule({ upcomingClasses }: Props) {
  const { user } = useAuth();
  const [liveSessionIds, setLiveSessionIds] = useState<Set<string>>(new Set());
  const classIds = useMemo(() => upcomingClasses.map(c => c.id), [upcomingClasses]);
  const unreadCounts = useUnreadMessages(classIds);
  const { play: playNotificationSound } = useNotificationSound();

  useEffect(() => {
    if (!user || upcomingClasses.length === 0) return;

    // Check which sessions are currently in progress
    const inProgress = upcomingClasses.filter(c => c.session_status === "in_progress").map(c => c.id);
    setLiveSessionIds(new Set(inProgress));

    // Listen for realtime updates on bookings
    const channel = supabase
      .channel("student-session-status")
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "bookings",
        filter: `student_id=eq.${user.id}`,
      }, (payload) => {
        const updated = payload.new as any;
        setLiveSessionIds(prev => {
          const next = new Set(prev);
          if (updated.session_status === "in_progress") {
            next.add(updated.id);
            // Play sound and show toast when teacher starts
            if (!prev.has(updated.id)) {
              playNotificationSound();
              toast.success("🎓 المعلم بدأ الحصة! انضم الآن", { duration: 10000 });
            }
          } else {
            next.delete(updated.id);
          }
          return next;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, upcomingClasses]);

  if (upcomingClasses.length === 0) return null;

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Calendar className="h-4 w-4 text-primary" />
          </div>
          جدول الحصص القادمة
          <Badge className="mr-auto bg-primary/10 text-primary border-0 text-xs">{upcomingClasses.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-right py-2 px-3 font-semibold">التاريخ</th>
                <th className="text-right py-2 px-3 font-semibold">الوقت</th>
                <th className="text-right py-2 px-3 font-semibold">المادة</th>
                <th className="text-right py-2 px-3 font-semibold">المعلم</th>
                <th className="text-right py-2 px-3 font-semibold">الحالة</th>
                <th className="text-right py-2 px-3 font-semibold">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {upcomingClasses.map((c: any) => {
                const isToday = new Date(c.scheduled_at).toDateString() === new Date().toDateString();
                const isLive = liveSessionIds.has(c.id);
                const time = new Date(c.scheduled_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
                const date = new Date(c.scheduled_at).toLocaleDateString("ar-SA", { weekday: "short", month: "short", day: "numeric" });
                return (
                  <tr key={c.id} className={`border-b last:border-0 ${isLive ? "bg-secondary/5" : isToday ? "bg-accent/50" : ""}`}>
                    <td className="py-3 px-3 font-medium">{isToday ? "اليوم" : date}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {time}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-bold">{c.subjects?.name || "حصة"}</td>
                    <td className="py-3 px-3">{c.teacher_name || "معلم"}</td>
                    <td className="py-3 px-3">
                      {isLive ? (
                        <Badge className="bg-secondary/10 text-secondary border-0 text-[10px] animate-pulse">🔴 جارية الآن</Badge>
                      ) : c.status === "confirmed" ? (
                        <Badge className="bg-secondary/10 text-secondary border-0 text-[10px]">مؤكدة ✓</Badge>
                      ) : (
                        <Badge className="bg-orange-500/10 text-orange-600 border-0 text-[10px]">قيد الانتظار</Badge>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        {isLive ? (
                          <Button size="sm" className="gradient-cta text-secondary-foreground rounded-lg h-7 text-xs animate-pulse" asChild>
                            <Link to={`/session?booking=${c.id}`}><Video className="h-3 w-3 ml-1" />انضم الآن</Link>
                          </Button>
                        ) : c.status === "confirmed" ? (
                          <Button size="sm" variant="outline" className="rounded-lg h-7 text-xs" asChild>
                            <Link to={`/session?booking=${c.id}`}>
                              <Clock className="h-3 w-3 ml-1" />بانتظار المعلم
                            </Link>
                          </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" className="rounded-lg h-7 text-xs relative" asChild>
                          <Link to={`/chat?booking=${c.id}`}>
                            <MessageSquare className="h-3 w-3" />
                            {(unreadCounts[c.id] || 0) > 0 && (
                              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[8px] flex items-center justify-center font-bold">
                                {unreadCounts[c.id]}
                              </span>
                            )}
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}