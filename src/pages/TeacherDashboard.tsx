import Navbar from "@/components/Navbar";
import BrandLoader from "@/components/BrandLoader";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, DollarSign, Users, Star, BarChart3, Settings, AlertCircle, MessageSquare, Play, ArrowLeft, CalendarDays, XCircle, Video, MapPin } from "lucide-react";
import { getSaudiMonthKey } from "@/lib/saudiDate";

import BookingRequests from "@/components/teacher/BookingRequests";
import WarningsSection from "@/components/teacher/WarningsSection";
import WithdrawalSection from "@/components/teacher/WithdrawalSection";
import TeacherScheduleTable from "@/components/teacher/TeacherScheduleTable";
import TeacherCustomerServiceButton from "@/components/teacher/CustomerServiceButton";
import TeacherSessionMaterials from "@/components/teacher/TeacherSessionMaterials";
import ScheduledSessionsCalendar from "@/components/ScheduledSessionsCalendar";
import InPersonTeacherPanel from "@/components/inPerson/TeacherPanel";

import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useIsPhoneDevice } from "@/hooks/use-is-phone";

const localDayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const TeacherDashboard = () => {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({
    earnings: 0, onlineEarnings: 0, inPersonEarnings: 0, inPersonCompensations: 0,
    students: 0, completed: 0, cancelled: 0, online: 0, inPerson: 0, rating: 0,
  });
  const [statsLoadError, setStatsLoadError] = useState(false);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [teacherProfile, setTeacherProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [openRequestsCount, setOpenRequestsCount] = useState(0);
  const isPhone = useIsPhoneDevice();
  const todayKey = localDayKey(new Date());
  const todaySessions = schedule.filter((session) => localDayKey(new Date(session.scheduled_at)) === todayKey);
  const nextSession = [...todaySessions].sort((a, b) => {
    if (a.session_status === "in_progress" && b.session_status !== "in_progress") return -1;
    if (b.session_status === "in_progress" && a.session_status !== "in_progress") return 1;
    return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
  })[0];

  useEffect(() => {
    if (!user) return;
    fetchData();

    const channel = supabase
      .channel("teacher-bookings")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "bookings",
        filter: `teacher_id=eq.${user.id}`,
      }, (payload) => {
        fetchData();
        // Only toast on INSERT (truly new booking).
        // Cancellations / status updates come through the notifications table with proper Arabic text,
        // so we avoid a generic "booking updated" message here.
        if (payload.eventType === "INSERT") {
          toast.info("لديك حجز جديد! 📚");
        }
      })
      .subscribe();

    // Realtime: booking requests count updates instantly
    const reqChannel = supabase
      .channel(`teacher-requests-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "booking_requests",
      }, (payload) => {
        fetchData();
        if (payload.eventType === "INSERT") toast.info("طلب حجز جديد! 🔔");
      })
      .subscribe();

    // Realtime: teacher notifications (instant toast)
    const notifChannel = supabase
      .channel(`teacher-notif-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const n = payload.new as any;
        toast.info(n.title || "إشعار جديد", { description: n.body });
      })
      .subscribe();

    // Realtime: earnings update instantly when a session ends
    const earningsChannel = supabase
      .channel(`teacher-earnings-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "teacher_earnings",
        filter: `teacher_id=eq.${user.id}`,
      }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(reqChannel);
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(earningsChannel);
    };
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    try {

    const now = new Date().toISOString();
    const [
      teacherProfileResult,
      requestCountResult,
      upcomingScheduledResult,
      liveSessionsResult,
      waitingAcceptanceResult,
    ] = await Promise.all([
      supabase.from("teacher_profiles").select("*").eq("user_id", user.id).single(),
      supabase.from("booking_requests").select("id", { count: "exact", head: true })
        .eq("status", "open").gte("expires_at", now),
      supabase.from("bookings").select("*, subjects(name)")
        .eq("teacher_id", user.id).eq("status", "confirmed").gte("scheduled_at", now)
        .order("scheduled_at").limit(10),
      supabase.from("bookings").select("*, subjects(name)")
        .eq("teacher_id", user.id).eq("status", "confirmed").eq("session_status", "in_progress")
        .order("scheduled_at", { ascending: false }).limit(5),
      supabase.from("bookings").select("*, subjects(name)")
        .eq("teacher_id", user.id).eq("status", "confirmed").eq("session_status", "waiting_acceptance")
        .order("scheduled_at", { ascending: false }).limit(10),
    ]);
    const tp = teacherProfileResult.data;
    setTeacherProfile(tp);
    setOpenRequestsCount(requestCountResult.count || 0);

    // Fetch upcoming scheduled sessions + accepted instant sessions (in_progress)
    const upcomingScheduled = upcomingScheduledResult.data;
    const liveSessions = liveSessionsResult.data;
    const waitingAcceptance = waitingAcceptanceResult.data;
    // Merge and deduplicate
    const allIds = new Set<string>();
    const upcoming: typeof upcomingScheduled = [];
    [...(liveSessions || []), ...(waitingAcceptance || []), ...(upcomingScheduled || [])].forEach(b => {
      if (!allIds.has(b.id)) { allIds.add(b.id); upcoming.push(b); }
    });

    if (upcoming && upcoming.length > 0) {
      const studentIds = [...new Set(upcoming.map(b => b.student_id))];
      const { data: studentProfiles } = await supabase
        .from("public_profiles")
        .select("user_id, full_name")
        .in("user_id", studentIds);
      const profileMap = new Map((studentProfiles ?? []).map(p => [p.user_id, p]));
      setSchedule(upcoming.map(b => ({ ...b, student_profile: profileMap.get(b.student_id) })));
    } else {
      setSchedule([]);
    }

    const currentMonth = getSaudiMonthKey();
    const studentIdsPromise = (async () => {
      const ids = new Set<string>();
      const studentPageSize = 500;
      for (let from = 0; ; from += studentPageSize) {
        const { data: studentRows, error: studentRowsError } = await supabase
          .from("bookings")
          .select("student_id")
          .eq("teacher_id", user.id)
          .order("id")
          .range(from, from + studentPageSize - 1);
        if (studentRowsError) throw studentRowsError;
        (studentRows ?? []).forEach((row) => {
          if (row.student_id) ids.add(row.student_id);
        });
        if (!studentRows || studentRows.length < studentPageSize) break;
      }
      return ids;
    })();
    const [
      completedCountResult,
      cancelledCountResult,
      onlineCountResult,
      inPersonCountResult,
      monthSummaryResult,
      studentIds,
    ] = await Promise.all([
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("teacher_id", user.id).eq("status", "completed"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("teacher_id", user.id).eq("status", "cancelled"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("teacher_id", user.id).eq("status", "completed").eq("delivery_mode", "online"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("teacher_id", user.id).eq("status", "completed").eq("delivery_mode", "in_person"),
      supabase.rpc("get_teacher_month_earnings_split" as any, { _teacher_id: user.id, _month: currentMonth }),
      studentIdsPromise,
    ]);
    const bookingCountError = [
      completedCountResult.error,
      cancelledCountResult.error,
      onlineCountResult.error,
      inPersonCountResult.error,
    ].find(Boolean);
    if (bookingCountError) {
      setStatsLoadError(true);
      throw bookingCountError;
    }
    // Show net earnings from completed sessions, less amounts already transferred
    // to the manually withdrawable earnings ledger.
    const { data: monthSummary, error: monthSummaryError } = monthSummaryResult;
    if (monthSummaryError) throw monthSummaryError;
    const month = monthSummary?.[0] as any;
    const totalMonthEarnings = Number(month?.combined_earnings) || 0;

    setStats({
      earnings: totalMonthEarnings,
      onlineEarnings: Number(month?.online_earnings) || 0,
      inPersonEarnings: Number(month?.in_person_earnings) || 0,
      inPersonCompensations: Number(month?.in_person_compensations) || 0,
      students: studentIds.size,
      completed: completedCountResult.count ?? 0,
      cancelled: cancelledCountResult.count ?? 0,
      online: onlineCountResult.count ?? 0,
      inPerson: inPersonCountResult.count ?? 0,
      rating: Number(tp?.avg_rating) || 0,
    });
    setStatsLoadError(false);
    } catch (fetchErr) {
      console.error("[teacher-dashboard] fetchData error:", fetchErr);
      setStatsLoadError(true);
      // Transient network error (e.g. edge-function crash dropped HTTP/2 connection).
      // Silently retry once after 2s so the dashboard recovers automatically.
      setTimeout(() => {
        if (user) fetchData();
      }, 2000);
    } finally {
      setLoading(false);
    }
  };

  const displayName = profile?.full_name || "معلم";
  const isApproved = teacherProfile?.is_approved;

  // Show loading state (unified with global PageLoader to avoid stacked loaders)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <BrandLoader />
      </div>
    );
  }

  // Show pending approval screen if teacher is not approved
  if (teacherProfile && !isApproved) {
    return (
      <div className="min-h-screen bg-muted/30 pb-16 md:pb-0">
        <Navbar />
        <div className="container py-16 flex items-center justify-center">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full">
            <Card className="border-0 shadow-card text-center">
              <CardContent className="p-10 space-y-6">
                <div className="w-20 h-20 rounded-2xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center mx-auto">
                  <AlertCircle className="h-10 w-10 text-amber-600" />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-foreground mb-2">مرحباً، {displayName} 👋</h1>
                  <p className="text-lg font-bold text-amber-600 mb-2">حسابك في انتظار الموافقة</p>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    تم استلام طلبك بنجاح وسيتم مراجعته من قبل الإدارة. ستتمكن من استخدام لوحة التحكم بعد الموافقة على حسابك.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <Button variant="outline" className="rounded-xl gap-2" asChild>
                    <Link to="/profile"><Settings className="h-4 w-4" /> أكمل ملفك الشخصي</Link>
                  </Button>
                  <Button variant="ghost" className="rounded-xl gap-2" onClick={() => window.location.href = "/support"}>
                    <MessageSquare className="h-4 w-4" /> تواصل مع خدمة العملاء
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-16 md:pb-0">
      <Navbar />
      <div className="container py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-2xl md:text-3xl font-black text-foreground">مرحباً، {displayName} 👋</h1>
            <p className="text-muted-foreground">
              لديك {openRequestsCount} طلب متاح و {schedule.length} حصة قادمة
            </p>
          </motion.div>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-xl gap-2" asChild>
              <Link to="/teacher/wallet">💳 المحفظة</Link>
            </Button>
            <Button variant="outline" className="rounded-xl gap-2" asChild>
              <Link to="/profile"><Settings className="h-4 w-4" /> إعدادات الحساب</Link>
            </Button>
          </div>
        </div>

        {/* Stats - removed pricing/hourly rate */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3 mb-8">
          {[
            {
              icon: DollarSign,
              label: "أرباح الشهر",
              value: statsLoadError ? "—" : `${stats.earnings.toLocaleString()} ر.س`,
              detail: statsLoadError
                ? "تعذر تحميل الإحصاءات"
                : `أونلاين ${stats.onlineEarnings.toLocaleString()} · حضوري ${stats.inPersonEarnings.toLocaleString()} ر.س${stats.inPersonCompensations ? ` · تعويضات ${stats.inPersonCompensations.toLocaleString()}` : ""}`,
              color: "text-secondary",
              bg: "bg-secondary/10",
            },
            { icon: Users, label: "عدد الطلاب", value: statsLoadError ? "—" : stats.students.toLocaleString(), color: "text-primary", bg: "bg-primary/10" },
            { icon: CalendarCheck, label: "حصص مكتملة", value: statsLoadError ? "—" : stats.completed.toLocaleString(), color: "text-accent-foreground", bg: "bg-accent" },
            { icon: XCircle, label: "حصص ملغاة", value: statsLoadError ? "—" : stats.cancelled.toLocaleString(), color: "text-destructive", bg: "bg-destructive/10" },
            { icon: Video, label: "حصص أونلاين", detail: "مكتملة", value: statsLoadError ? "—" : stats.online.toLocaleString(), color: "text-primary", bg: "bg-primary/10" },
            { icon: MapPin, label: "حصص حضوري", detail: "مكتملة", value: statsLoadError ? "—" : stats.inPerson.toLocaleString(), color: "text-secondary", bg: "bg-secondary/10" },
            { icon: Star, label: "التقييم", value: statsLoadError ? "—" : stats.rating.toFixed(1), color: "text-gold", bg: "bg-gold/10" },
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

        {nextSession ? (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <Card className="overflow-hidden border-0 bg-gradient-to-l from-[#123d6b] via-[#174f79] to-[#168276] text-white shadow-lg">
              <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                    {nextSession.session_status === "in_progress" ? <Play className="h-6 w-6" /> : <CalendarDays className="h-6 w-6" />}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-white/70">{nextSession.session_status === "in_progress" ? "الحصة جارية الآن" : "الإجراء التالي · أقرب حصة"}</p>
                    <h2 className="mt-0.5 text-lg font-black">{nextSession.subjects?.name || "حصة تعليمية"}</h2>
                    <Badge className="mt-1 border-0 bg-white/15 text-white">{nextSession.delivery_mode === "in_person" ? "حضوري" : "أونلاين"}</Badge>
                    <p className="mt-1 text-xs text-white/75">مع {nextSession.student_profile?.full_name || "الطالب"} · {new Date(nextSession.scheduled_at).toLocaleString("ar-SA", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
                {nextSession.delivery_mode === "in_person" ? (
                  <Button className="gap-2 rounded-xl bg-white text-primary hover:bg-white/90" onClick={() => document.getElementById("in-person-sessions")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                    عرض عنوان الحصة <ArrowLeft className="h-4 w-4" />
                  </Button>
                ) : !isPhone && (
                  <Button asChild className="gap-2 rounded-xl bg-white text-primary hover:bg-white/90">
                    <Link to={`/session?booking=${nextSession.id}`}>ابدأ الحصة <ArrowLeft className="h-4 w-4" /></Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <Card className="mb-6 border-dashed border-secondary/30 bg-secondary/[0.03]">
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-black">لا توجد حصة مجدولة اليوم</p><p className="mt-1 text-xs text-muted-foreground">راجع الجدول اليومي لمتابعة حصص الأيام القادمة أو حدّث أوقات التوفر لاستقبال حصص جديدة.</p></div>
              <Button variant="outline" className="gap-2 rounded-xl" onClick={() => document.getElementById("booking-requests")?.scrollIntoView({ behavior: "smooth" })}>راجع الطلبات <ArrowLeft className="h-4 w-4" /></Button>
            </CardContent>
          </Card>
        )}

        <div className="mb-6">
          <Link to="/teacher/assignments">
            <Card className="border-0 shadow-card hover:shadow-lg transition cursor-pointer bg-gradient-to-l from-primary/10 to-secondary/10">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                    <CalendarCheck className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold">الواجبات والاختبارات</h3>
                    <p className="text-xs text-muted-foreground">أنشئ واجبات وراجع حلول الطلاب بمساعدة AI</p>
                  </div>
                </div>
                <Badge>جديد</Badge>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <InPersonTeacherPanel />
            <div id="booking-requests"><BookingRequests onAccepted={fetchData} /></div>
            <ScheduledSessionsCalendar role="teacher" />
            <TeacherScheduleTable historyOnly onInstantSessionSent={fetchData} />
          </div>

          {/* Withdrawal Section */}
          <WithdrawalSection />

          {/* Teaching Materials */}
          <TeacherSessionMaterials />

          {/* Warnings & Violations */}
          <WarningsSection />

          {/* Performance summary removed per request */}
        </div>
      </div>
      <TeacherCustomerServiceButton />
      <BottomNav />
    </div>
  );
};

export default TeacherDashboard;
