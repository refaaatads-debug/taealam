import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, ArrowRight, Zap, Calendar, User, BookOpen, Timer, MinusCircle, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";

interface DeductionRecord {
  id: string;
  booking_id: string;
  duration_minutes: number;
  deducted_minutes: number;
  teacher_earning: number;
  short_session: boolean;
  started_at: string;
  ended_at: string;
  teacher_name: string;
  subject_name: string;
}

const SubscriptionDetails = () => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<any>(null);
  const [deductions, setDeductions] = useState<DeductionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    // Fetch ALL active subscriptions and aggregate
    const { data: subs } = await supabase
      .from("user_subscriptions")
      .select("*, subscription_plans(name_ar, tier, sessions_count)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (subs && subs.length > 0) {
      const totalRemaining = subs.reduce((s, x: any) => s + (x.remaining_minutes || 0), 0);
      const totalHours = subs.reduce((s, x: any) => s + (x.total_hours || 0), 0);
      const totalSessions = subs.reduce((s, x: any) => s + (x.sessions_remaining || 0), 0);
      setSubscription({
        ...subs[0],
        remaining_minutes: totalRemaining,
        total_hours: totalHours,
        sessions_remaining: totalSessions,
        _aggregated_count: subs.length,
      });
    } else {
      setSubscription(null);
    }

    // Fetch completed sessions with deduction info
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, teacher_id, subject_id, subjects(name), scheduled_at")
      .eq("student_id", user.id)
      .eq("status", "completed")
      .order("scheduled_at", { ascending: false })
      .limit(50);

    if (bookings && bookings.length > 0) {
      const bookingIds = bookings.map(b => b.id);
      const teacherIds = [...new Set(bookings.map(b => b.teacher_id))];

      const [sessionsRes, profilesRes] = await Promise.all([
        supabase.from("sessions").select("booking_id, duration_minutes, deducted_minutes, teacher_earning, short_session, started_at, ended_at").in("booking_id", bookingIds),
        supabase.from("public_profiles").select("user_id, full_name").in("user_id", teacherIds),
      ]);

      const sessionsMap = new Map((sessionsRes.data ?? []).map(s => [s.booking_id, s]));
      const profilesMap = new Map((profilesRes.data ?? []).map(p => [p.user_id, p.full_name]));

      const records: DeductionRecord[] = bookings
        .map(b => {
          const session = sessionsMap.get(b.id);
          if (!session) return null;
          return {
            id: b.id,
            booking_id: b.id,
            duration_minutes: session.duration_minutes || 0,
            deducted_minutes: (session as any).deducted_minutes || 0,
            teacher_earning: (session as any).teacher_earning || 0,
            short_session: (session as any).short_session || false,
            started_at: session.started_at || b.scheduled_at,
            ended_at: session.ended_at || "",
            teacher_name: profilesMap.get(b.teacher_id) || "معلم",
            subject_name: (b.subjects as any)?.name || "مادة",
          };
        })
        .filter(Boolean) as DeductionRecord[];

      setDeductions(records);
    }

    setLoading(false);
  };

  const remainingMinutes = (subscription as any)?.remaining_minutes ?? (subscription?.sessions_remaining ?? 0) * 45;
  const totalHours = (subscription as any)?.total_hours ?? 0;
  const totalMinutesOriginal = totalHours > 0 ? totalHours * 60 : (subscription?.subscription_plans?.sessions_count ?? 0) * 45;
  const usedMinutes = Math.max(0, totalMinutesOriginal - remainingMinutes);
  const usagePercent = totalMinutesOriginal > 0 ? Math.min(100, (usedMinutes / totalMinutesOriginal) * 100) : 0;
  const totalDeducted = deductions.reduce((sum, d) => sum + d.deducted_minutes, 0);

  return (
    <div className="min-h-screen bg-muted/30 pb-16 md:pb-0">
      <Navbar />
      <div className="container py-8 max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" className="rounded-xl" asChild>
            <Link to="/student"><ArrowRight className="h-5 w-5" /></Link>
          </Button>
          <h1 className="text-xl font-black text-foreground">تفاصيل الباقة</h1>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        ) : !subscription ? (
          <Card className="border-0 shadow-card text-center py-12">
            <CardContent>
              <Clock className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h2 className="text-lg font-bold text-foreground mb-2">لا توجد باقة نشطة</h2>
              <p className="text-sm text-muted-foreground mb-4">اشترك في باقة للبدء بحجز الحصص</p>
              <Button className="gradient-cta text-secondary-foreground rounded-xl" asChild>
                <Link to="/pricing">تصفح الباقات <Zap className="mr-1 h-4 w-4" /></Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Balance Overview */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="border-0 shadow-card overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2 font-bold">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Timer className="h-4 w-4 text-primary" />
                    </div>
                    ملخص الباقة
                    <Badge className="mr-auto bg-secondary/10 text-secondary border-0 text-xs">
                      {subscription?.subscription_plans?.name_ar || "نشط"}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-muted/50 rounded-xl p-3 text-center">
                      <p className="text-xl font-black text-foreground">{remainingMinutes}</p>
                      <p className="text-[11px] text-muted-foreground">دقيقة متبقية</p>
                    </div>
                    <div className="bg-muted/50 rounded-xl p-3 text-center">
                      <p className="text-xl font-black text-foreground">{usedMinutes}</p>
                      <p className="text-[11px] text-muted-foreground">دقيقة مستخدمة</p>
                    </div>
                    <div className="bg-muted/50 rounded-xl p-3 text-center">
                      <p className="text-xl font-black text-foreground">{Math.round(totalMinutesOriginal)}</p>
                      <p className="text-[11px] text-muted-foreground">إجمالي الباقة</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>المستخدم: {usagePercent.toFixed(0)}%</span>
                      <span>المتبقي: {(100 - usagePercent).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-muted/30 rounded-full h-3">
                      <div
                        className="bg-secondary rounded-full h-3 transition-all duration-500"
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                  </div>

                  {subscription?.ends_at && (
                    <p className="text-xs text-muted-foreground text-center">
                      <Calendar className="inline h-3 w-3 ml-1" />
                      تنتهي الباقة: {new Date(subscription.ends_at).toLocaleDateString("ar-SA")}
                    </p>
                  )}

                  {remainingMinutes <= 60 && (
                    <Button className="w-full gradient-cta text-secondary-foreground rounded-xl shadow-button" asChild>
                      <Link to="/pricing">تجديد الباقة <Zap className="mr-1 h-4 w-4" /></Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Deductions Log */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card className="border-0 shadow-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2 font-bold">
                    <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                      <MinusCircle className="h-4 w-4 text-secondary" />
                    </div>
                    سجل الخصومات
                    <Badge variant="outline" className="mr-auto text-xs">
                      {deductions.length} جلسة
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {deductions.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">لا توجد خصومات بعد</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Summary */}
                      <div className="flex items-center justify-between p-3 rounded-xl bg-destructive/5 border border-destructive/10">
                        <span className="text-sm font-bold text-foreground">إجمالي الخصومات</span>
                        <span className="text-sm font-black text-destructive">{totalDeducted} دقيقة</span>
                      </div>

                      {deductions.map((d, i) => (
                        <motion.div
                          key={d.id}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          className="p-3 rounded-xl bg-muted/50 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${d.short_session ? "bg-muted" : "bg-secondary/10"}`}>
                                <BookOpen className={`h-4 w-4 ${d.short_session ? "text-muted-foreground" : "text-secondary"}`} />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-foreground">{d.subject_name}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <User className="h-3 w-3" /> {d.teacher_name}
                                </p>
                              </div>
                            </div>
                            <div className="text-left">
                              {d.short_session ? (
                                <Badge variant="outline" className="text-[10px] bg-muted">لم تُحتسب</Badge>
                              ) : (
                                <p className="text-sm font-black text-destructive">-{d.deducted_minutes} د</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {d.started_at ? new Date(d.started_at).toLocaleDateString("ar-SA") : "—"}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              مدة الجلسة: {d.duration_minutes} دقيقة
                            </span>
                          </div>

                          {d.short_session && (
                            <p className="text-[11px] text-muted-foreground bg-muted/30 rounded-lg px-2 py-1">
                              ⏱️ الجلسة أقل من 5 دقائق - لم يتم الخصم
                            </p>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
};

export default SubscriptionDetails;
