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
import { CalendarCheck, Clock, Star, Video, TrendingUp, Sparkles, MessageSquare, XCircle, FileText, AlertTriangle, Zap, ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { completedTeachingSeconds } from "@/lib/bookingPresentation";

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
  const [stats, setStats] = useState({
    completedCount: 0, cancelledCount: 0, onlineCount: 0, inPersonCount: 0,
    actualSeconds: 0, progress: 0, points: 0,
  });
  const [sessionMetricsError, setSessionMetricsError] = useState(false);
  const [upcomingClasses, setUpcomingClasses] = useState<any[]>([]);
  const [pastClasses, setPastClasses] = useState<any[]>([]);
  const [cancelledClasses, setCancelledClasses] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [subscriptionLoadError, setSubscriptionLoadError] = useState(false);
  const [dashboardLoadError, setDashboardLoadError] = useState(false);
  const [stripeSubscription, setStripeSubscription] = useState<{ subscribed: boolean; tier: string | null; subscription_end: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const refreshDashboardRef = useRef<(() => Promise<void>) | null>(null);

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

    let disposed = false;
    let latestRequest = 0;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const fetchData = async () => {
      const requestId = ++latestRequest;
      setLoading(true);
      try {
        const now = new Date().toISOString();
        const completedHistoryPromise = supabase.from("bookings")
          .select("*, subjects(name), reviews(rating), sessions(started_at,ended_at,duration_minutes,duration_seconds,deducted_minutes)")
          .eq("student_id", user.id).eq("status", "completed").order("scheduled_at", { ascending: false });
        const stripeStatusPromise = supabase.functions.invoke("check-subscription")
          .catch((error) => ({ data: null, error }));
        const [
          upcomingResult,
          liveResult,
          completedCountResult,
          cancelledResult,
          onlineCompletedResult,
          inPersonCompletedResult,
          pointsResult,
          subscriptionResult,
        ] = await Promise.all([
          supabase.from("bookings").select("*, subjects(name)")
            .eq("student_id", user.id).in("status", ["pending", "confirmed"])
            .gte("scheduled_at", now).order("scheduled_at").limit(10),
          supabase.from("bookings").select("*, subjects(name)")
            .eq("student_id", user.id).eq("status", "confirmed")
            .eq("session_status", "in_progress").order("scheduled_at", { ascending: false }).limit(5),
          supabase.from("bookings").select("id", { count: "exact", head: true })
            .eq("student_id", user.id).eq("status", "completed"),
          supabase.from("bookings").select("*, subjects(name)", { count: "exact" })
            .eq("student_id", user.id).eq("status", "cancelled")
            .order("scheduled_at", { ascending: false }).limit(5),
          supabase.from("bookings").select("id", { count: "exact", head: true })
            .eq("student_id", user.id).eq("status", "completed")
            .eq("delivery_mode", "online"),
          supabase.from("bookings").select("id", { count: "exact", head: true })
            .eq("student_id", user.id).eq("status", "completed").eq("delivery_mode", "in_person"),
          supabase.from("student_points").select("total_points").eq("user_id", user.id).maybeSingle(),
          supabase.from("user_subscriptions")
            .select("*, subscription_plans(name_ar, tier)")
            .eq("user_id", user.id).eq("is_active", true)
            .gt("remaining_minutes", 0).order("created_at", { ascending: true }),
        ]);

        if (disposed || requestId !== latestRequest) return;
        let hasDashboardError = false;
        const sessionMetricsFailed = [
          completedCountResult.error,
          cancelledResult.error,
          onlineCompletedResult.error,
          inPersonCompletedResult.error,
        ].some(Boolean);
        setSessionMetricsError(sessionMetricsFailed);
        if (sessionMetricsFailed) hasDashboardError = true;

        if (upcomingResult.error || liveResult.error) {
          hasDashboardError = true;
          console.error("Student dashboard bookings failed to load", upcomingResult.error || liveResult.error);
        } else {
          const allIds = new Set<string>();
          const upcoming: any[] = [];
          [...(liveResult.data || []), ...(upcomingResult.data || [])].forEach((booking) => {
            if (!allIds.has(booking.id)) {
              allIds.add(booking.id);
              upcoming.push(booking);
            }
          });
          const teacherIds = [...new Set(upcoming.map((booking) => booking.teacher_id).filter(Boolean))];
          const teacherResult = teacherIds.length
            ? await supabase.from("public_profiles").select("user_id, full_name").in("user_id", teacherIds)
            : { data: [], error: null };
          if (disposed || requestId !== latestRequest) return;
          if (teacherResult.error) {
            hasDashboardError = true;
            console.error("Student dashboard teacher names failed to load", teacherResult.error);
          } else {
            const teacherNames = new Map((teacherResult.data ?? []).map((teacher) => [teacher.user_id, teacher.full_name]));
            setUpcomingClasses(upcoming.map((booking) => ({
              ...booking,
              teacher_name: teacherNames.get(booking.teacher_id) || "معلم",
            })));
          }
        }

        setStats((previous) => ({
          ...previous,
          completedCount: completedCountResult.count ?? 0,
          onlineCount: onlineCompletedResult.count ?? 0,
          inPersonCount: inPersonCompletedResult.count ?? 0,
          progress: Math.min(((completedCountResult.count ?? 0) / 20) * 100, 100),
        }));
        void completedHistoryPromise.then(({ data, error }) => {
          if (disposed || requestId !== latestRequest) return;
          if (error) {
            setDashboardLoadError(true);
            console.error("Student dashboard completed bookings failed to load", error);
            return;
          }
          const completed = data ?? [];
          setPastClasses(completed.slice(0, 10));
          let totalActualSeconds = 0;
          completed.forEach((booking: any) => {
            const session = Array.isArray(booking.sessions) ? booking.sessions[0] : booking.sessions;
            totalActualSeconds += completedTeachingSeconds(booking, session);
          });
          setStats((previous) => ({ ...previous, actualSeconds: totalActualSeconds }));
        });

        if (cancelledResult.error) {
          hasDashboardError = true;
          console.error("Student dashboard cancelled bookings failed to load", cancelledResult.error);
        } else {
          setCancelledClasses(cancelledResult.data ?? []);
          setStats((previous) => ({ ...previous, cancelledCount: cancelledResult.count ?? (cancelledResult.data ?? []).length }));
        }

        if (pointsResult.error) {
          hasDashboardError = true;
          console.error("Student dashboard points failed to load", pointsResult.error);
        } else {
          setStats((previous) => ({ ...previous, points: pointsResult.data?.total_points ?? 0 }));
        }

        if (subscriptionResult.error) {
          hasDashboardError = true;
          setSubscriptionLoadError(true);
          console.error("Student dashboard subscription balance failed to load", subscriptionResult.error);
        } else {
          setSubscriptionLoadError(false);
          const subs = subscriptionResult.data ?? [];
          if (subs.length > 0) {
            setSubscription({
              ...subs[0],
              remaining_minutes: subs.reduce((sum, row: any) => sum + Number(row.remaining_minutes || 0), 0),
              total_hours: subs.reduce((sum, row: any) => sum + Number(row.total_hours || 0), 0),
              sessions_remaining: subs.reduce((sum, row: any) => sum + Number(row.sessions_remaining || 0), 0),
              _aggregated_count: subs.length,
            });
          } else {
            setSubscription(null);
          }
        }

        void stripeStatusPromise.then(({ data, error }: any) => {
          if (disposed || requestId !== latestRequest) return;
          if (!error && data && !data.error) setStripeSubscription(data);
          else if (error) console.error("Could not check Stripe subscription", error);
        });
        setDashboardLoadError(hasDashboardError);
      } catch (error) {
        if (!disposed && requestId === latestRequest) {
          console.error("Student dashboard refresh failed", error);
          setDashboardLoadError(true);
          setSubscriptionLoadError(true);
        }
      } finally {
        if (!disposed && requestId === latestRequest) setLoading(false);
      }
    };

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void fetchData(), 150);
    };
    refreshDashboardRef.current = fetchData;
    void fetchData();

    // Realtime: refresh when booking status changes
    const channel = supabase
      .channel("student-bookings")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "bookings",
        filter: `student_id=eq.${user.id}`,
      }, () => {
        scheduleRefresh();
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
        scheduleRefresh();
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
      }, scheduleRefresh)
      .subscribe();

    // Realtime: points update instantly when earned
    const pointsChannel = supabase
      .channel(`student-points-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "student_points",
        filter: `user_id=eq.${user.id}`,
      }, scheduleRefresh)
      .subscribe();

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      disposed = true;
      latestRequest += 1;
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (refreshDashboardRef.current === fetchData) refreshDashboardRef.current = null;
      supabase.removeChannel(channel);
      supabase.removeChannel(subChannel);
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(walletChannel);
      supabase.removeChannel(pointsChannel);
    };
  }, [user, playSound]);

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

        {dashboardLoadError && (
          <Card className="mb-6 border-amber-200 bg-amber-50/70">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-amber-900">تعذر تحديث بعض بيانات اللوحة. البيانات السابقة لم تُستبدل ببيانات فارغة.</p>
              <Button size="sm" variant="outline" onClick={() => void refreshDashboardRef.current?.()}>
                إعادة المحاولة
              </Button>
            </CardContent>
          </Card>
        )}

        {nextClass ? (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <Card className="overflow-hidden border-0 gradient-hero text-white shadow-lg">
              <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                    {nextClass.delivery_mode !== "in_person" && nextClass.session_status === "in_progress" ? <Video className="h-6 w-6" /> : <CalendarDays className="h-6 w-6" />}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-white/70">{nextClass.session_status === "in_progress" ? "الحصة جارية الآن" : "الإجراء التالي · أقرب حصة"}</p>
                    <h2 className="mt-0.5 text-lg font-black">{nextClass.subjects?.name || "حصة تعليمية"}</h2>
                    <p className="mt-1 text-xs text-white/75">مع {nextClass.teacher_name || "المعلم"} · {new Date(nextClass.scheduled_at).toLocaleString("ar-SA", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
                {nextClass.status === "confirmed" && (nextClass.delivery_mode === "in_person" ? (
                  nextClass.attendance_confirmed_at || nextClass.session_status === "in_progress" ? (
                    <span className="rounded-xl bg-white/15 px-4 py-2 text-sm font-bold">الحصة الحضورية جارية</span>
                  ) : (
                    <Button className="gap-2 rounded-xl bg-white text-primary hover:bg-white/90" onClick={() => document.getElementById("student-daily-schedule")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                      إدخال رمز الحضور <ArrowLeft className="h-4 w-4" />
                    </Button>
                  )
                ) : (
                  <Button asChild className="gap-2 rounded-xl bg-white text-primary hover:bg-white/90">
                    <Link to={`/session?booking=${nextClass.id}`}>انضم للجلسة <ArrowLeft className="h-4 w-4" /></Link>
                  </Button>
                ))}
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
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3 mb-8">
            {Array.from({ length: 7 }).map((_, i) => (
              <Card key={i} className="border-0 shadow-card">
                <CardContent className="p-3 sm:p-3.5 space-y-2">
                  <Skeleton className="w-8 h-8 rounded-lg" />
                  <Skeleton className="h-5 w-14" />
                  <Skeleton className="h-3 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3 mb-8">
          {[
            { icon: CalendarCheck, label: "حصص مكتملة", value: sessionMetricsError ? "—" : stats.completedCount.toLocaleString(), color: "text-primary", bg: "bg-primary/10" },
            { icon: XCircle, label: "حصص ملغاة", value: sessionMetricsError ? "—" : stats.cancelledCount.toLocaleString(), color: "text-destructive", bg: "bg-destructive/10" },
            { icon: Video, label: "حصص أونلاين", detail: "مكتملة", value: sessionMetricsError ? "—" : stats.onlineCount.toLocaleString(), color: "text-primary", bg: "bg-primary/10" },
            { icon: MapPin, label: "حصص حضوري", detail: "مكتملة", value: sessionMetricsError ? "—" : stats.inPersonCount.toLocaleString(), color: "text-secondary", bg: "bg-secondary/10" },
            { icon: Clock, label: "وقت التعلم الفعلي", value: formatDuration(stats.actualSeconds), color: "text-secondary", bg: "bg-secondary/10" },
            { icon: TrendingUp, label: "نسبة التقدم", value: `${Math.round(stats.progress)}%`, color: "text-accent-foreground", bg: "bg-accent" },
            { icon: Star, label: "النقاط", value: stats.points.toLocaleString(), color: "text-gold", bg: "bg-gold/10" },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="h-full min-w-0 border-0 shadow-card hover:shadow-card-hover transition-all duration-300">
                <CardContent className="p-3 sm:p-3.5">
                  <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center mb-2`}>
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                  </div>
                  <p className="truncate text-lg font-black leading-tight text-foreground sm:text-xl">{s.value}</p>
                  <p className="mt-1 truncate text-[11px] leading-4 text-muted-foreground">{s.label}</p>
                  {"detail" in s && s.detail && <p className="mt-0.5 truncate text-[9px] leading-3 text-muted-foreground">{s.detail}</p>}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <ScheduledSessionsCalendar role="student" />

            <Card className="border-dashed">
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-bold">تبحث عن حصة حضورية؟</h2>
                  <p className="text-sm text-muted-foreground">ابدأ طلبك واختر عنوان الزيارة من صفحة البحث.</p>
                </div>
                <Button asChild><Link to="/search?mode=in_person">الانتقال إلى البحث الحضوري</Link></Button>
              </CardContent>
            </Card>

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
            <SubscriptionBalance
              subscription={subscription}
              stripeSubscription={stripeSubscription}
              loading={loading}
              loadError={subscriptionLoadError}
              onRetry={() => void refreshDashboardRef.current?.()}
            />

            {/* AI Tutor CTA */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="border-0 shadow-card overflow-hidden gradient-hero text-primary-foreground">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-5 w-5 text-gold" />
                    <span className="text-sm font-bold">المساعد سند الذكي</span>
                  </div>
                  <p className="text-base font-black mb-1">هل تحتاج مساعدة؟</p>
                  <p className="text-xs opacity-80 mb-4">اسأل المساعد سند الذكي أي سؤال واحصل على إجابة فورية</p>
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
