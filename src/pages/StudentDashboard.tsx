import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import SmartMatchWidget from "@/components/SmartMatchWidget";
import PendingBookingRequests from "@/components/student/PendingBookingRequests";
import WarningsSection from "@/components/teacher/WarningsSection";
import SubscriptionBalance from "@/components/student/SubscriptionBalance";
import SessionMaterials from "@/components/student/SessionMaterials";
import StudentScheduleTable from "@/components/student/StudentScheduleTable";
import CustomerServiceButton from "@/components/student/CustomerServiceButton";
import ScheduledSessionsCalendar from "@/components/ScheduledSessionsCalendar";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarCheck, Clock, Star, Video, TrendingUp, Sparkles, MessageSquare, XCircle, FileText, AlertTriangle, Zap, ArrowLeft, CalendarDays } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
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

const localDayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

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
  const [profileIncomplete, setProfileIncomplete] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const checkProfile = () => {
      supabase
        .from("profiles")
        .select("full_name, phone, teaching_stage")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled) return;
          const complete = !!(data?.full_name && data?.phone && (data as any)?.teaching_stage);
          setProfileIncomplete(!complete);
        });
    };
    checkProfile();
    // Realtime: react to profile updates (no focus refetch — relies on cache + realtime)
    const ch = supabase
      .channel(`profile-completion-${user.id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "profiles",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const p: any = payload.new;
        const complete = !!(p?.full_name && p?.phone && p?.teaching_stage);
        setProfileIncomplete(!complete);
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user]);

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
        const teacherIds = [...new Set(upcoming.map(b => b.teacher_id).filter(Boolean))];
        const { data: teacherProfiles } = teacherIds.length > 0
          ? await supabase
              .from("public_profiles")
              .select("user_id, full_name")
              .in("user_id", teacherIds)
          : { data: [] };
        const tMap = new Map((teacherProfiles ?? []).map(p => [p.user_id, p.full_name]));
        setUpcomingClasses(upcoming.map(b => ({ ...b, teacher_name: tMap.get(b.teacher_id) || "معلم" })));
      } else {
        setUpcomingClasses([]);
      }

      // Fetch completed bookings with sessions for actual time
      const { data: completedBookings } = await supabase
        .from("bookings")
        .select("*, subjects(name), reviews(rating), sessions(started_at,ended_at,duration_minutes,duration_seconds,deducted_minutes)")
        .eq("student_id", user.id)
        .eq("status", "completed")
        .order("scheduled_at", { ascending: false });

      const completed = completedBookings || [];
      setPastClasses(completed.slice(0, 10));

      // Calculate actual seconds — same fallback chain as TeacherPerformanceTab:
      // deducted_minutes → duration_seconds → wall-clock (ended_at - started_at)
      let totalActualSeconds = 0;
      completed.forEach((b: any) => {
        const session = Array.isArray(b.sessions) ? b.sessions[0] : b.sessions;
        if (!session) return;
        let secs = 0;
        if (session.deducted_minutes > 0) {
          secs = session.deducted_minutes * 60;
        } else if (session.duration_seconds > 0) {
          secs = session.duration_seconds;
        } else if (session.started_at && session.ended_at) {
          secs = Math.floor(
            (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000
          );
        }
        if (secs > 0) totalActualSeconds += secs;
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

      // Fetch ALL active subscriptions and aggregate (student may have multiple)
      const now = new Date().toISOString();
      const { data: subs } = await supabase
          .from("user_subscriptions")
          .select("*, session_duration_minutes, subscription_plans(name_ar, tier)")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .gt("remaining_minutes", 0)
          .gt("ends_at", now)
          .order("ends_at", { ascending: true });
      if (subs && subs.length > 0) {
        const totalRemaining = subs.reduce((sum, s: any) => sum + (s.remaining_minutes || 0), 0);
        const totalHours    = subs.reduce((sum, s: any) => sum + (s.total_hours    || 0), 0);
        const totalSessions = subs.reduce((sum, s: any) => sum + (s.sessions_remaining || 0), 0);
        setSubscription({
          ...subs[0],
          remaining_minutes: totalRemaining,
          total_hours:       totalHours,
          sessions_remaining: totalSessions,
          _aggregated_count: subs.length,
        });
      } else {
        setSubscription(null);
      }

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
      }, () => {
        // Re-fetch aggregated subscription totals on any change
        fetchData();
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

    // Realtime: wallet balance updates instantly (after payment/deduction)
    const walletChannel = supabase
      .channel(`student-wallet-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "wallets",
        filter: `user_id=eq.${user.id}`,
      }, () => fetchData())
      .subscribe();

    // Realtime: points update instantly when earned
    const pointsChannel = supabase
      .channel(`student-points-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "student_points",
        filter: `user_id=eq.${user.id}`,
      }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(subChannel);
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(walletChannel);
      supabase.removeChannel(pointsChannel);
    };
  }, [user]);

  const displayName = profile?.full_name || "طالب";
  const remainingMinutes = subscription?.remaining_minutes ?? 0;
  const SESSION_MINUTES = (subscription as any)?.session_duration_minutes || 60;
  const canBook = subscription && remainingMinutes >= SESSION_MINUTES;
  const showLowBalanceBanner = !loading && subscription && remainingMinutes < SESSION_MINUTES && remainingMinutes > 0;
  const showNoBanner = !loading && subscription && remainingMinutes <= 0;
  const todayKey = localDayKey(new Date());
  const todayClasses = upcomingClasses.filter((session) => localDayKey(new Date(session.scheduled_at)) === todayKey);
  const nextClass = [...todayClasses].sort((a, b) => {
    if (a.session_status === "in_progress" && b.session_status !== "in_progress") return -1;
    if (b.session_status === "in_progress" && a.session_status !== "in_progress") return 1;
    return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
  })[0];

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

        {nextClass ? (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <Card className="overflow-hidden border-0 bg-gradient-to-l from-[#123d6b] via-[#174f79] to-[#168276] text-white shadow-lg">
              <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                    {nextClass.session_status === "in_progress" ? <Video className="h-6 w-6" /> : <CalendarDays className="h-6 w-6" />}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-white/70">{nextClass.session_status === "in_progress" ? "الحصة جارية الآن" : "الإجراء التالي · أقرب حصة"}</p>
                    <h2 className="mt-0.5 text-lg font-black">{nextClass.subjects?.name || "حصة تعليمية"}</h2>
                    <p className="mt-1 text-xs text-white/75">مع {nextClass.teacher_name || "المعلم"} · {new Date(nextClass.scheduled_at).toLocaleString("ar-SA", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
                {nextClass.status === "confirmed" && (
                  <Button asChild className="gap-2 rounded-xl bg-white text-primary hover:bg-white/90">
                    <Link to={`/session?booking=${nextClass.id}`}>انضم للجلسة <ArrowLeft className="h-4 w-4" /></Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <Card className="mb-6 border-dashed border-primary/30 bg-primary/[0.03]">
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black">لا توجد حصة مجدولة اليوم</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {canBook ? "افتح الجدول اليومي لمتابعة حصص الأيام القادمة أو ابدأ حجز حصة جديدة." : "افتح الجدول اليومي لمتابعة مواعيدك القادمة أو ابدأ من بطاقة رصيد الباقة."}
                </p>
              </div>
              {canBook && (
                <Button asChild className="gap-2 rounded-xl">
                  <Link to="/search">احجز حصتك الآن <ArrowLeft className="h-4 w-4" /></Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {profileIncomplete && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20">
              <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                    <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">استكمل بياناتك للبدء بالحجز والاشتراك</p>
                    <p className="text-xs text-muted-foreground mt-0.5">الاسم الكامل، رقم الهاتف، والمرحلة الدراسية مطلوبة</p>
                  </div>
                </div>
                <Button asChild size="sm" className="rounded-lg shrink-0">
                  <Link to="/complete-profile?redirect=/student">استكمال الآن</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Low Balance Warning Banner */}
        {showLowBalanceBanner && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <Card className="border-orange-300 dark:border-orange-700 bg-orange-50/80 dark:bg-orange-950/30">
              <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">رصيدك لا يكفي لحجز حصة</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      رصيدك الحالي {remainingMinutes} دقيقة — الحصة الواحدة تحتاج {SESSION_MINUTES} دقيقة على الأقل
                    </p>
                  </div>
                </div>
                <Button asChild size="sm" className="rounded-lg shrink-0 gradient-cta text-secondary-foreground shadow-button">
                  <Link to="/pricing"><Zap className="ml-1 h-3.5 w-3.5" />تجديد الباقة</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* No Balance Warning Banner */}
        {showNoBanner && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <Card className="border-red-300 dark:border-red-700 bg-red-50/80 dark:bg-red-950/30">
              <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">انتهى رصيدك!</p>
                    <p className="text-xs text-muted-foreground mt-0.5">لا يمكنك حجز حصص حتى تجدد باقتك</p>
                  </div>
                </div>
                <Button asChild size="sm" className="rounded-lg shrink-0 gradient-cta text-secondary-foreground shadow-button">
                  <Link to="/pricing"><Zap className="ml-1 h-3.5 w-3.5" />اشترك الآن</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

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
            <ScheduledSessionsCalendar role="student" />

            {/* Booking requests are kept directly below the unified schedule. */}
            <PendingBookingRequests />

            <StudentScheduleTable historyOnly />

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

            {/* Assignments Quick Access */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <Card className="border-0 shadow-card hover:shadow-card-hover transition-all duration-300">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <p className="text-base font-black">الواجبات والاختبارات</p>
                      <p className="text-xs text-muted-foreground">حلّ واجباتك واحصل على تقييم AI</p>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full rounded-xl" asChild>
                    <Link to="/student/assignments">عرض الواجبات</Link>
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

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
