import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import SmartMatchWidget from "@/components/SmartMatchWidget";
import GamificationCard from "@/components/GamificationCard";
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
import { CalendarCheck, Clock, BookOpen, Star, Video, TrendingUp, ChevronLeft, Sparkles, MessageSquare, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNotificationSound } from "@/hooks/useNotificationSound";

const StudentDashboard = () => {
  const { user, profile } = useAuth();
  const { play: playSound } = useNotificationSound();
  const [stats, setStats] = useState({ bookings: 0, hours: 0, progress: 0, points: 0 });
  const [upcomingClasses, setUpcomingClasses] = useState<any[]>([]);
  const [pastClasses, setPastClasses] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [stripeSubscription, setStripeSubscription] = useState<{ subscribed: boolean; tier: string | null; subscription_end: string | null } | null>(null);
  const [freeTrialAvailable, setFreeTrialAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      // Fetch upcoming bookings
      const { data: upcoming } = await supabase
        .from("bookings")
        .select("*, subjects(name)")
        .eq("student_id", user.id)
        .in("status", ["pending", "confirmed"])
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at")
        .limit(10);

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

      // Fetch past bookings
      const { data: past } = await supabase
        .from("bookings")
        .select("*, subjects(name), reviews(rating)")
        .eq("student_id", user.id)
        .eq("status", "completed")
        .order("scheduled_at", { ascending: false })
        .limit(5);
      setPastClasses(past || []);

      // Fetch points
      const { data: pointsData } = await supabase
        .from("student_points")
        .select("total_points")
        .eq("user_id", user.id)
        .single();

      // Fetch bookings count
      const { count: bookingsCount } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("student_id", user.id)
        .eq("status", "completed");

      setStats({
        bookings: bookingsCount || 0,
        hours: Math.round((bookingsCount || 0) * 0.75), // 45 min per session
        progress: Math.min(((bookingsCount || 0) / 20) * 100, 100),
        points: pointsData?.total_points || 0,
      });

      // Fetch subscription
      const { data: sub } = await supabase
        .from("user_subscriptions")
        .select("*, subscription_plans(name_ar, tier)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single();
      setSubscription(sub);

      // Check free trial - only show if no completed bookings
      const { data: profileData } = await supabase
        .from("profiles")
        .select("free_trial_used")
        .eq("user_id", user.id)
        .single();
      setFreeTrialAvailable(!profileData?.free_trial_used && (bookingsCount || 0) === 0);

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

        {/* Free Trial Banner - only if no completed sessions */}
        {freeTrialAvailable && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-0 shadow-card mb-6 overflow-hidden bg-gradient-to-l from-gold/10 via-gold/5 to-transparent border-gold/20">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gold/10 flex items-center justify-center">
                    <Zap className="h-6 w-6 text-gold" />
                  </div>
                  <div>
                    <p className="font-black text-foreground">🎁 حصة مجانية تجريبية!</p>
                    <p className="text-xs text-muted-foreground">احجز أول حصة مجاناً وجرّب المنصة</p>
                  </div>
                </div>
                <Button className="gradient-cta text-secondary-foreground rounded-xl shadow-button" asChild>
                  <Link to="/search">احجز مجاناً <Zap className="mr-1 h-4 w-4" /></Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Stats */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: CalendarCheck, label: "حصص مكتملة", value: stats.bookings.toString(), color: "text-primary", bg: "bg-primary/10" },
            { icon: Clock, label: "ساعات التعلم", value: stats.hours.toString(), color: "text-secondary", bg: "bg-secondary/10" },
            { icon: TrendingUp, label: "نسبة التقدم", value: `${Math.round(stats.progress)}%`, color: "text-accent-foreground", bg: "bg-accent" },
            { icon: Star, label: "النقاط", value: stats.points.toLocaleString(), color: "text-gold", bg: "bg-gold/10" },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="border-0 shadow-card hover:shadow-card-hover transition-all duration-300">
                <CardContent className="p-5">
                  <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
                    <s.icon className={`h-5 w-5 ${s.color}`} />
                  </div>
                  <p className="text-2xl font-black text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* AI Tutor CTA */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="border-0 shadow-card overflow-hidden gradient-hero text-primary-foreground">
                <CardContent className="p-6 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-5 w-5 text-gold" />
                      <span className="text-sm font-bold">المدرس الذكي AI</span>
                    </div>
                    <p className="text-lg font-black mb-1">هل تحتاج مساعدة في الواجب؟</p>
                    <p className="text-sm opacity-80">اسأل المدرس الذكي أي سؤال واحصل على إجابة فورية</p>
                  </div>
                  <Button className="bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-0 rounded-xl backdrop-blur-sm" asChild>
                    <Link to="/ai-tutor"><MessageSquare className="ml-2 h-4 w-4" />اسأل الآن</Link>
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {/* Subscription Balance */}
            <SubscriptionBalance subscription={subscription} stripeSubscription={stripeSubscription} freeTrialAvailable={freeTrialAvailable} />


            {/* Pending Booking Requests with Countdown + Cancel */}
            <PendingBookingRequests />

            {/* Warnings */}
            <WarningsSection />

            {/* Upcoming Schedule Table */}
            <UpcomingSchedule upcomingClasses={upcomingClasses} />

            {/* Upcoming Classes Cards */}
            <Card className="border-0 shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2 font-bold">
                  <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                    <Video className="h-4 w-4 text-secondary" />
                  </div>
                  الحصص القادمة
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
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Session Materials (7-day retention with AI analysis) */}
            <SessionMaterials />

            {/* Past Classes */}
            {pastClasses.length > 0 && (
              <Card className="border-0 shadow-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-bold">سجل الحصص</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pastClasses.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                      <div>
                        <p className="font-bold text-sm text-foreground">{c.subjects?.name || "حصة"}</p>
                        <p className="text-xs text-muted-foreground">{new Date(c.scheduled_at).toLocaleDateString("ar-SA")}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {c.reviews?.[0] && Array.from({ length: c.reviews[0].rating }).map((_, j) => (
                          <Star key={j} className="h-3.5 w-3.5 fill-gold text-gold" />
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <GamificationCard />
            <SmartMatchWidget />
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  );
};

export default StudentDashboard;
