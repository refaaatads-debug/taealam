import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Clock, BookOpen, CheckCircle, XCircle, Star, Award,
  CreditCard, AlertTriangle, MessageSquare, TrendingUp,
} from "lucide-react";
import type { StudentBundle } from "@/pages/AdminStudentProfile";

const StatCard = ({ icon: Icon, label, value, tone = "default", sub }: any) => {
  const tones: Record<string, string> = {
    default: "from-primary/10 to-primary/5 text-primary",
    success: "from-emerald-500/10 to-emerald-500/5 text-emerald-600",
    warning: "from-amber-500/10 to-amber-500/5 text-amber-600",
    destructive: "from-destructive/10 to-destructive/5 text-destructive",
    info: "from-sky-500/10 to-sky-500/5 text-sky-600",
  };
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${tones[tone]} flex items-center justify-center`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground/70 mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
};

const StudentOverviewTab = ({ data }: { data: StudentBundle }) => {
  const completed = data.bookings.filter((b: any) => b.status === "completed").length;
  const cancelled = data.bookings.filter((b: any) => b.status === "cancelled").length;
  const upcoming = data.bookings.filter((b: any) => new Date(b.scheduled_at) > new Date() && b.status === "confirmed").length;
  const activeSub = data.subscriptions.find((s: any) => s.is_active);
  const totalMin = activeSub?.subscription_plans?.session_duration_minutes && activeSub?.sessions_count
    ? activeSub.subscription_plans.session_duration_minutes * activeSub.sessions_count
    : (activeSub?.remaining_minutes || 0) + (activeSub?.subscription_plans?.session_duration_minutes || 0);
  const remainingMin = activeSub?.remaining_minutes || 0;
  const usagePct = totalMin > 0 ? Math.max(0, Math.min(100, ((totalMin - remainingMin) / totalMin) * 100)) : 0;

  const openTickets = data.tickets.filter((t: any) => t.status !== "closed").length;
  const totalPaid = data.payments.filter((p: any) => p.status === "completed" || p.status === "paid").reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={BookOpen} label="إجمالي الحجوزات" value={data.bookings.length} />
        <StatCard icon={CheckCircle} label="حصص مكتملة" value={completed} tone="success" />
        <StatCard icon={Clock} label="حصص قادمة" value={upcoming} tone="info" />
        <StatCard icon={XCircle} label="حصص ملغاة" value={cancelled} tone="warning" />
        <StatCard icon={Star} label="النقاط" value={data.points?.total_points || 0} tone="success" />
        <StatCard icon={Award} label="الشارات" value={data.badges.length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Subscription card */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /> الاشتراك الحالي</h3>
              {activeSub ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/15">فعّال</Badge> : <Badge variant="outline">لا يوجد</Badge>}
            </div>
            {activeSub ? (
              <div className="space-y-3">
                <div>
                  <div className="text-lg font-bold">{activeSub.subscription_plans?.name_ar || "باقة"}</div>
                  <div className="text-xs text-muted-foreground">
                    {activeSub.starts_at && `من ${new Date(activeSub.starts_at).toLocaleDateString("ar-SA")}`}
                    {activeSub.ends_at && ` حتى ${new Date(activeSub.ends_at).toLocaleDateString("ar-SA")}`}
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">الاستهلاك</span>
                    <span className="font-bold">{remainingMin} دقيقة متبقية</span>
                  </div>
                  <Progress value={usagePct} className="h-2" />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div className="rounded-lg bg-muted/50 p-2 text-center">
                    <div className="text-lg font-bold text-primary">{activeSub.sessions_remaining || 0}</div>
                    <div className="text-[10px] text-muted-foreground">حصص متبقية</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2 text-center">
                    <div className="text-lg font-bold">{activeSub.sessions_count || 0}</div>
                    <div className="text-[10px] text-muted-foreground">إجمالي الحصص</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-6 text-center">لا يوجد اشتراك فعّال للطالب</div>
            )}
          </CardContent>
        </Card>

        {/* Financial overview */}
        <Card>
          <CardContent className="p-5">
            <h3 className="font-bold mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> ملخص مالي</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
                <div className="text-2xl font-bold text-emerald-600">{totalPaid.toFixed(0)}</div>
                <div className="text-xs text-muted-foreground">إجمالي المدفوع</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="text-2xl font-bold">{data.payments.length}</div>
                <div className="text-xs text-muted-foreground">عدد العمليات</div>
              </div>
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                <div className="text-2xl font-bold text-amber-600">{data.payments.filter((p: any) => p.status === "pending").length}</div>
                <div className="text-xs text-muted-foreground">معلّقة</div>
              </div>
              <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3">
                <div className="text-2xl font-bold text-destructive">{data.payments.filter((p: any) => p.status === "failed").length}</div>
                <div className="text-xs text-muted-foreground">فاشلة</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Compact warnings + reviews */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <h3 className="font-bold mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> المخالفات والتنبيهات</h3>
            {data.warnings.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">لا توجد مخالفات ✓</div>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.warnings.slice(0, 5).map((w: any) => (
                  <li key={w.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/40">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium">{w.warning_type}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{w.description || "—"}</div>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{new Date(w.created_at).toLocaleDateString("ar-SA")}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="font-bold mb-3 flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> آخر التقييمات للمعلمين</h3>
            {data.reviews.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">لم يقيّم أي حصة بعد</div>
            ) : (
              <ul className="space-y-2">
                {data.reviews.slice(0, 4).map((r: any) => (
                  <li key={r.id} className="p-2 rounded-md bg-muted/40">
                    <div className="flex items-center gap-1 mb-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`h-3 w-3 ${i < r.rating ? "fill-amber-400 text-amber-400" : "text-muted"}`} />
                      ))}
                    </div>
                    {r.comment && <p className="text-xs text-muted-foreground line-clamp-2">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StudentOverviewTab;
