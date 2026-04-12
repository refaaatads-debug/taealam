import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import SmartMatchWidget from "@/components/SmartMatchWidget";
import PendingBookingRequests from "@/components/student/PendingBookingRequests";
import WarningsSection from "@/components/teacher/WarningsSection";
import SubscriptionBalance from "@/components/student/SubscriptionBalance";
import SessionMaterials from "@/components/student/SessionMaterials";
import StudentScheduleTable from "@/components/student/StudentScheduleTable";
import CustomerServiceButton from "@/components/student/CustomerServiceButton";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarCheck, Clock, BookOpen, Star, Video, TrendingUp, Sparkles, MessageSquare, XCircle, X, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNotificationSound } from "@/hooks/useNotificationSound";

const formatDuration = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const StudentDashboard = () => {
  const { user, profile } = useAuth();
  const { play: playSound } = useNotificationSound();
  const [stats, setStats] = useState({ completedCount: 0, cancelledCount: 0, actualSeconds: 0, progress: 0, points: 0 });
  const [upcomingClasses, setUpcomingClasses] = useState<any[]>([]);
  const [pastClasses, setPastClasses] = useState<any[]>([]);
  const [cancelledClasses, setCancelledClasses] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [stripeSubscription, setStripeSubscription] = useState<{ subscribed: boolean; tier: string | null; subscription_end: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleCancelBooking = async (booking: any) => {
    setCancellingId(booking.id);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "cancelled" as any })
        .eq("id", booking.id)
        .eq("student_id", user!.id);
      if (error) throw error;

      await supabase.from("notifications").insert({
        user_id: booking.teacher_id,
        title: "تم إلغاء حصة",
        body: `قام الطالب بإلغاء حصة ${booking.subjects?.name || "حصة"} المقررة في ${new Date(booking.scheduled_at).toLocaleDateString("ar-SA")}`,
        type: "booking_cancelled",
      });

      toast.success("تم إلغاء الحصة بنجاح");
      setUpcomingClasses(prev => prev.filter(c => c.id !== booking.id));
    } catch {
      toast.error("حدث خطأ أثناء إلغاء الحصة");
    } finally {
      setCancellingId(null);
    }
  };

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      // Fetch upcoming bookings
      // Fetch upcoming scheduled + accepted instant sessions (in_progress)
      const [{ data: upcomingScheduled }, { data: liveSessions }] = await Promise.all([
        supabase
          .from("bookings")
          .select("*, subjects(name)")
          .eq("student_id", user.id)
          .in("status", ["pending", "confirmed"])
          .gte("scheduled_at", new Date().toISOString())
          .order("scheduled_at")
          .limit(10),
        supabase
          .from("bookings")
          .select("*, subjects(name)")
          .eq("student_id", user.id)
          .eq("status", "confirmed")
          .eq("session_status", "in_progress")
          .order("scheduled_at", { ascending: false })
          .limit(5),
      ]);
      // Merge and deduplicate
      const allIds = new Set<string>();
      const upcoming: typeof upcomingScheduled = [];
      [...(liveSessions || []), ...(upcomingScheduled || [])].forEach(b => {
        if (!allIds.has(b.id)) { allIds.add(b.id); upcoming.push(b); }
      });

      // Enrich with teacher names
      if (upcoming && upcoming.length > 0) {
        const teacherIds = [...new Set(upcoming.map(b => b.teacher_id))];
        const { data: teacherProfiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", teacherIds);
        const tMap = new Map((teacherProfiles ?? []).map(p => [p.user_id, p.full_name]));
        setUpcomingClasses(upcoming.map(b => ({ ...b, teacher_name: tMap.get(b.teacher_id) || "معلم" })));
      } else {
        setUpcomingClasses([]);
      }

      // Fetch completed bookings with sessions for actual time
      const { data: completedBookings } = await supabase
        .from("bookings")
        .select("*, subjects(name), reviews(rating), sessions(started_at, ended_at, duration_minutes)")
        .eq("student_id", user.id)
        .eq("status", "completed")
        .order("scheduled_at", { ascending: false });

      const completed = completedBookings || [];
      setPastClasses(completed.slice(0, 10));

      // Calculate actual seconds from sessions
      let totalActualSeconds = 0;
      completed.forEach((b: any) => {
        const session = Array.isArray(b.sessions) ? b.sessions[0] : b.sessions;
        if (session?.started_at && session?.ended_at) {
          const seconds = Math.floor(
            (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000
          );
          if (seconds > 0) totalActualSeconds += seconds;
        }
      });

      // Fetch cancelled/incomplete bookings
      const { data: cancelled } = await supabase
        .from("bookings")
        .select("*, subjects(name)")
        .eq("student_id", user.id)
        .eq("status", "cancelled")
        .order("scheduled_at", { ascending: false })
        .limit(5);
      setCancelledClasses(cancelled || []);

      // Fetch points
      const { data: pointsData } = await supabase
        .from("student_points")
        .select("total_points")
        .eq("user_id", user.id)
        .single();

      setStats({
        completedCount: completed.length,
        cancelledCount: (cancelled || []).length,
        actualSeconds: totalActualSeconds,
        progress: Math.min((completed.length / 20) * 100, 100),
        points: pointsData?.total_points || 0,
      });

      // Fetch subscription (get most recent active one)
      const { data: subs } = await supabase
        .from("user_subscriptions")
        .select("*, subscription_plans(name_ar, tier)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);
      setSubscription(subs && subs.length > 0 ? subs[0] : null);

      // Check Stripe subscription status
      try {
        const { data: stripeSub } = await supabase.functions.invoke("check-subscription");
        if (stripeSub && !stripeSub.error) {
          setStripeSubscription(stripeSub);
        }
      } catch {
        console.log("Could not check stripe subscription");
      }

      setLoading(false);
    };

    fetchData();

    // Realtime: refresh when booking status changes
    const channel = supabase
      .channel("student-bookings")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "bookings",
        filter: `student_id=eq.${user.id}`,
      }, () => {
        fetchData();
        playSound();
        toast.info("تم تحديث حجوزاتك! 📚");
      })
      .subscribe();

    // Realtime: listen for subscription changes
    const subChannel = supabase
      .channel("student-subscription-sync")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "user_subscriptions",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const updated = payload.new as any;
        if (updated) {
          setSubscription((prev: any) => ({ ...prev, ...updated }));
          if (updated.remaining_minutes !== undefined && updated.remaining_minutes <= 0) {
            toast.error("⚠️ انتهت باقتك! اشترك من جديد لمواصلة التعلم", { duration: 8000 });
          }
        }
      })
      .subscribe();

    // Realtime: listen for new notifications
    const notifChannel = supabase
      .channel("student-notifications-dashboard")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        playSound();
        const n = payload.new as any;
        toast.info(n.title, { description: n.body });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(subChannel);
      supabase.removeChannel(notifChannel);
    };
  }, [user]);

  const displayName = profile?.full_name || "طالب";

  return (
    <div className="min-h-screen bg-muted/30 pb-16 md:pb-0">
      <Navbar />
      <CustomerServiceButton />
      <div className="container py-8">
        {/* Welcome */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-2xl md:text-3xl font-black text-foreground">مرحباً، {displayName} 👋</h1>
            <p className="text-muted-foreground">
              لديك {upcomingClasses.length} حصص قادمة
              {subscription && <span className="text-secondary font-semibold"> • {(subscription as any).subscription_plans?.name_ar}</span>}
            </p>
          </motion.div>
        </div>

        {/* Stats */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="border-0 shadow-card">
                <CardContent className="p-5 space-y-3">
                  <Skeleton className="w-10 h-10 rounded-xl" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {[
            { icon: CalendarCheck, label: "حصص مكتملة", value: stats.completedCount.toString(), color: "text-primary", bg: "bg-primary/10" },
            { icon: XCircle, label: "حصص غير مكتملة", value: stats.cancelledCount.toString(), color: "text-destructive", bg: "bg-destructive/10" },
            { icon: Clock, label: "وقت التعلم الفعلي", value: formatDuration(stats.actualSeconds), color: "text-secondary", bg: "bg-secondary/10" },
            { icon: TrendingUp, label: "نسبة التقدم", value: `${Math.round(stats.progress)}%`, color: "text-accent-foreground", bg: "bg-accent" },
            { icon: Star, label: "النقاط", value: stats.points.toLocaleString(), color: "text-gold", bg: "bg-gold/10" },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="border-0 shadow-card hover:shadow-card-hover transition-all duration-300">
                <CardContent className="p-5">
                  <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
                    <s.icon className={`h-5 w-5 ${s.color}`} />
                  </div>
                  <p className="text-xl font-black text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Upcoming Classes Cards */}
            <Card className="border-0 shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2 font-bold">
                  <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                    <Video className="h-4 w-4 text-secondary" />
                  </div>
                  الحصص القادمة
                  {upcomingClasses.length > 0 && (
                    <Badge className="mr-auto bg-secondary/10 text-secondary border-0 text-xs">{upcomingClasses.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcomingClasses.length === 0 ? (
                  <div className="text-center py-6">
                    <Video className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">لا توجد حصص قادمة</p>
                    <Button variant="outline" className="mt-3 rounded-xl" asChild>
                      <Link to="/search">احجز حصة الآن</Link>
                    </Button>
                  </div>
                ) : (
                  upcomingClasses.map((c: any, i: number) => {
                    const isToday = new Date(c.scheduled_at).toDateString() === new Date().toDateString();
                    const time = new Date(c.scheduled_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
                    const date = isToday ? "اليوم" : new Date(c.scheduled_at).toLocaleDateString("ar-SA", { weekday: "long" });
                    const isPending = c.status === "pending";
                    const isConfirmed = c.status === "confirmed";
                    return (
                      <motion.div key={c.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.05 }} className={`flex items-center justify-between p-4 rounded-2xl transition-colors ${isToday && isConfirmed ? "bg-accent border border-secondary/20" : isPending ? "bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/50" : "bg-muted/50"}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${isToday && isConfirmed ? "gradient-cta text-secondary-foreground" : "bg-card"}`}>
                            <BookOpen className={`h-5 w-5 ${!(isToday && isConfirmed) ? "text-primary" : ""}`} />
                          </div>
                          <div>
                            <p className="font-bold text-sm text-foreground">{c.subjects?.name || "حصة"} - {c.teacher_name || "معلم"}</p>
                            <p className="text-xs text-muted-foreground">{date} • {time}</p>
                            {isPending && <p className="text-xs text-amber-600 font-semibold mt-0.5">⏳ في انتظار موافقة المعلم</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" className="rounded-xl gap-1.5 px-3" asChild>
                            <Link to={`/chat?booking=${c.id}`}>
                              <MessageSquare className="h-5 w-5" />
                              <span className="text-xs font-medium">دردشة</span>
                            </Link>
                          </Button>
                          {isConfirmed && (
                            <Button size="sm" className="gradient-cta text-secondary-foreground rounded-xl shadow-button" asChild>
                              <Link to={`/session?booking=${c.id}`}>انضم للجلسة</Link>
                            </Button>
                          )}
                          {c.session_status !== "in_progress" && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="rounded-xl h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10">
                                  {cancellingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>إلغاء الحصة</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    هل أنت متأكد من إلغاء حصة {c.subjects?.name || "حصة"} مع {c.teacher_name || "المعلم"}؟ سيتم إخطار المعلم بالإلغاء.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>تراجع</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => handleCancelBooking(c)}
                                  >
                                    نعم، إلغاء الحصة
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Pending Booking Requests */}
            <PendingBookingRequests />

            {/* Warnings */}
            <WarningsSection />

            {/* Session Materials */}
            <SessionMaterials />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Subscription Balance */}
            <SubscriptionBalance subscription={subscription} stripeSubscription={stripeSubscription} />

            {/* AI Tutor CTA */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="border-0 shadow-card overflow-hidden gradient-hero text-primary-foreground">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-5 w-5 text-gold" />
                    <span className="text-sm font-bold">المدرس الذكي AI</span>
                  </div>
                  <p className="text-base font-black mb-1">هل تحتاج مساعدة؟</p>
                  <p className="text-xs opacity-80 mb-4">اسأل المدرس الذكي أي سؤال واحصل على إجابة فورية</p>
                  <Button className="w-full bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-0 rounded-xl backdrop-blur-sm" asChild>
                    <Link to="/ai-tutor"><MessageSquare className="ml-2 h-4 w-4" />اسأل الآن</Link>
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {/* Schedule Table */}
            <StudentScheduleTable />

            {/* Smart Match */}
            <SmartMatchWidget />
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  );
};

export default StudentDashboard;
