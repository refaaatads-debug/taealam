import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, DollarSign, Users, Clock, Star, BarChart3, Settings, AlertCircle, MessageSquare } from "lucide-react";
import SchedulePricingManager from "@/components/teacher/SchedulePricingManager";
import BookingRequests from "@/components/teacher/BookingRequests";
import WarningsSection from "@/components/teacher/WarningsSection";
import WithdrawalSection from "@/components/teacher/WithdrawalSection";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TeacherDashboard = () => {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({ earnings: 0, students: 0, sessions: 0, rating: 0 });
  const [schedule, setSchedule] = useState<any[]>([]);
  const [teacherProfile, setTeacherProfile] = useState<any>(null);
  const [openRequestsCount, setOpenRequestsCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    fetchData();

    // Subscribe to new bookings in realtime
    const channel = supabase
      .channel("teacher-bookings")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "bookings",
        filter: `teacher_id=eq.${user.id}`,
      }, () => {
        fetchData();
        toast.info("لديك طلب حجز جديد! 📚");
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const fetchData = async () => {
    if (!user) return;

    // Fetch teacher profile
    const { data: tp } = await supabase
      .from("teacher_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();
    setTeacherProfile(tp);

    // Count open booking requests (for subtitle)
    const { count: reqCount } = await supabase
      .from("booking_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .gte("expires_at", new Date().toISOString());
    setOpenRequestsCount(reqCount || 0);

    // Fetch upcoming schedule (confirmed bookings)
    const now = new Date().toISOString();
    const { data: upcoming } = await supabase
      .from("bookings")
      .select("*, subjects(name)")
      .eq("teacher_id", user.id)
      .eq("status", "confirmed")
      .gte("scheduled_at", now)
      .order("scheduled_at")
      .limit(10);

    if (upcoming && upcoming.length > 0) {
      const studentIds = [...new Set(upcoming.map(b => b.student_id))];
      const { data: studentProfiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", studentIds);
      const profileMap = new Map((studentProfiles ?? []).map(p => [p.user_id, p]));
      setSchedule(upcoming.map(b => ({ ...b, student_profile: profileMap.get(b.student_id) })));
    } else {
      setSchedule([]);
    }

    // Stats
    const { count: studentCount } = await supabase
      .from("bookings")
      .select("student_id", { count: "exact", head: true })
      .eq("teacher_id", user.id);

    const { data: completedBookings } = await supabase
      .from("bookings")
      .select("price")
      .eq("teacher_id", user.id)
      .eq("status", "completed");

    const earnings = (completedBookings ?? []).reduce((sum, b) => sum + (Number(b.price) || 0), 0);

    setStats({
      earnings,
      students: studentCount || 0,
      sessions: tp?.total_sessions || 0,
      rating: Number(tp?.avg_rating) || 0,
    });
  };

  const displayName = profile?.full_name || "معلم";
  const isApproved = teacherProfile?.is_approved;

  return (
    <div className="min-h-screen bg-muted/30 pb-16 md:pb-0">
      <Navbar />
      <div className="container py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-2xl md:text-3xl font-black text-foreground">مرحباً، {displayName} 👋</h1>
            <p className="text-muted-foreground">
              {isApproved ? `لديك ${openRequestsCount} طلب متاح و ${schedule.length} حصة قادمة` : "حسابك في انتظار الموافقة"}
            </p>
          </motion.div>
          <Button variant="outline" className="rounded-xl gap-2" asChild>
            <Link to="/profile"><Settings className="h-4 w-4" /> إعدادات الحساب</Link>
          </Button>
        </div>

        {/* Pending Approval Banner */}
        {!isApproved && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-0 shadow-card mb-6 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
                  <AlertCircle className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="font-black text-foreground mb-1">حسابك في انتظار الموافقة</p>
                  <p className="text-sm text-muted-foreground">سيتم مراجعة حسابك من قبل الإدارة وتفعيله قريباً. ستصلك إشعار عند الموافقة.</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: DollarSign, label: "أرباح الشهر", value: `${stats.earnings.toLocaleString()} ر.س`, color: "text-secondary", bg: "bg-secondary/10" },
            { icon: Users, label: "عدد الطلاب", value: stats.students.toString(), color: "text-primary", bg: "bg-primary/10" },
            { icon: CalendarCheck, label: "إجمالي الحصص", value: stats.sessions.toString(), color: "text-accent-foreground", bg: "bg-accent" },
            { icon: Star, label: "التقييم", value: stats.rating.toFixed(1), color: "text-gold", bg: "bg-gold/10" },
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Booking Requests (Broadcast Model) */}
          <BookingRequests />

          {/* Schedule */}
          <Card className="border-0 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 font-bold">
                <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-secondary" />
                </div>
                الحصص القادمة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {schedule.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">لا توجد حصص قادمة</p>
              ) : (
                schedule.map((s: any, i: number) => {
                  const isToday = new Date(s.scheduled_at).toDateString() === new Date().toDateString();
                  return (
                    <motion.div key={s.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.05 }}
                      className={`flex items-center justify-between p-4 rounded-2xl ${isToday ? "bg-accent border border-secondary/20" : "bg-muted/50"}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${isToday ? "gradient-cta text-secondary-foreground" : "bg-card border"}`}>
                          <Users className={`h-5 w-5 ${!isToday ? "text-primary" : ""}`} />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-foreground">{s.student_profile?.full_name || "طالب"} - {s.subjects?.name || ""}</p>
                          <p className="text-xs text-muted-foreground">
                            {isToday ? "اليوم" : new Date(s.scheduled_at).toLocaleDateString("ar-SA", { weekday: "long" })} • {new Date(s.scheduled_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })} • {s.duration_minutes} دقيقة
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" className="rounded-xl gap-1.5 px-3" asChild>
                          <Link to={`/chat?booking=${s.id}`}>
                            <MessageSquare className="h-5 w-5" />
                            <span className="text-xs font-medium">دردشة</span>
                          </Link>
                        </Button>
                        {isToday && (
                          <Button size="sm" className="gradient-cta text-secondary-foreground rounded-xl shadow-button" asChild>
                            <Link to={`/session?booking=${s.id}`}>ابدأ الحصة</Link>
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Schedule & Pricing Manager */}
          <SchedulePricingManager />

          {/* Withdrawal Section */}
          <WithdrawalSection />

          {/* Warnings */}
          <WarningsSection />

          {/* Performance */}
          <Card className="border-0 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 font-bold">
                <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-secondary" />
                </div>
                ملخص الأداء
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-accent/50 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-black text-foreground">{stats.sessions}</p>
                  <p className="text-xs text-muted-foreground">حصة مكتملة</p>
                </div>
                <div className="bg-secondary/5 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-black text-foreground">{stats.rating.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">متوسط التقييم</p>
                </div>
                <div className="bg-accent/30 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-black text-foreground">{stats.earnings.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">إجمالي الأرباح (ر.س)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <BottomNav />
    </div>
  );
};

export default TeacherDashboard;
