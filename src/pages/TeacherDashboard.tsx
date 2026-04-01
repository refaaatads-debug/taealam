import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, DollarSign, Users, Clock, CheckCircle, XCircle, Star, BarChart3, Settings } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const TeacherDashboard = () => {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({ earnings: 0, students: 0, sessions: 0, rating: 0 });
  const [requests, setRequests] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      // Fetch pending booking requests
      const { data: pending } = await supabase
        .from("bookings")
        .select("*, subjects(name), profiles!bookings_student_id_fkey(full_name)")
        .eq("teacher_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10);
      setRequests(pending || []);

      // Fetch today's schedule
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { data: todayBookings } = await supabase
        .from("bookings")
        .select("*, subjects(name), profiles!bookings_student_id_fkey(full_name)")
        .eq("teacher_id", user.id)
        .eq("status", "confirmed")
        .gte("scheduled_at", today.toISOString())
        .lt("scheduled_at", tomorrow.toISOString())
        .order("scheduled_at");
      setSchedule(todayBookings || []);

      // Fetch teacher profile stats
      const { data: tp } = await supabase
        .from("teacher_profiles")
        .select("avg_rating, total_sessions, total_reviews")
        .eq("user_id", user.id)
        .single();

      // Count unique students
      const { count: studentCount } = await supabase
        .from("bookings")
        .select("student_id", { count: "exact", head: true })
        .eq("teacher_id", user.id);

      // Count completed sessions for earnings estimate
      const { count: completedCount } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("teacher_id", user.id)
        .eq("status", "completed");

      setStats({
        earnings: (completedCount || 0) * 80,
        students: studentCount || 0,
        sessions: tp?.total_sessions || 0,
        rating: tp?.avg_rating || 0,
      });
    };
    fetchData();
  }, [user]);

  const handleBookingAction = async (id: string, action: "confirmed" | "cancelled") => {
    await supabase.from("bookings").update({ status: action }).eq("id", id);
    setRequests((prev) => prev.filter((r) => r.id !== id));
  };

  const displayName = profile?.full_name || "معلم";

  return (
    <div className="min-h-screen bg-muted/30 pb-16 md:pb-0">
      <Navbar />
      <div className="container py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-2xl md:text-3xl font-black text-foreground">مرحباً، {displayName} 👋</h1>
            <p className="text-muted-foreground">لديك {schedule.length} حصة اليوم</p>
          </motion.div>
          <Button variant="outline" className="rounded-xl gap-2" asChild>
            <Link to="/profile"><Settings className="h-4 w-4" /> إعدادات الحساب</Link>
          </Button>
        </div>

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
          {/* Schedule */}
          <Card className="border-0 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 font-bold">
                <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-secondary" />
                </div>
                جدول اليوم
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {schedule.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">لا توجد حصص مجدولة اليوم</p>
              ) : (
                schedule.map((s: any, i: number) => (
                  <motion.div key={s.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1 }} className="flex items-center justify-between p-4 rounded-2xl bg-accent/50 border border-accent">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl gradient-cta flex items-center justify-center">
                        <Users className="h-5 w-5 text-secondary-foreground" />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-foreground">{s.profiles?.full_name || "طالب"} - {s.subjects?.name || ""}</p>
                        <p className="text-xs text-muted-foreground">{new Date(s.scheduled_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })} • {s.duration_minutes} دقيقة</p>
                      </div>
                    </div>
                    <Button size="sm" className="gradient-cta text-secondary-foreground rounded-xl shadow-button" asChild>
                      <Link to="/session">ابدأ الحصة</Link>
                    </Button>
                  </motion.div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Requests */}
          <Card className="border-0 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 font-bold">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <CalendarCheck className="h-4 w-4 text-primary" />
                </div>
                طلبات الحجز
                {requests.length > 0 && <Badge className="mr-auto bg-destructive/10 text-destructive border-0 text-xs">{requests.length} جديد</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {requests.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">لا توجد طلبات حجز جديدة</p>
              ) : (
                requests.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center border">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-foreground">{r.profiles?.full_name || "طالب"}</p>
                        <p className="text-xs text-muted-foreground">{r.subjects?.name || ""} • {new Date(r.scheduled_at).toLocaleDateString("ar-SA")}</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="icon" className="h-9 w-9 rounded-xl bg-secondary/10 hover:bg-secondary/20 text-secondary border-0" onClick={() => handleBookingAction(r.id, "confirmed")}>
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                      <Button size="icon" className="h-9 w-9 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive border-0" onClick={() => handleBookingAction(r.id, "cancelled")}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Earnings */}
          <Card className="border-0 shadow-card lg:col-span-2">
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
                <div className="bg-gold/5 rounded-2xl p-4 text-center">
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
