import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import BrandLoader from "@/components/BrandLoader";
import {
  ArrowRight, Phone, Mail, Calendar, MapPin, GraduationCap,
  Sparkles, AlertTriangle, Send, MessageSquare, Bell, Wallet,
  Activity, BookOpen, ClipboardList, CreditCard, LifeBuoy, Brain, Zap,
} from "lucide-react";
import { toast } from "sonner";
import StudentOverviewTab from "@/components/admin/student-profile/StudentOverviewTab";
import StudentSubscriptionsTab from "@/components/admin/student-profile/StudentSubscriptionsTab";
import StudentSessionsTab from "@/components/admin/student-profile/StudentSessionsTab";
import StudentPaymentsTab from "@/components/admin/student-profile/StudentPaymentsTab";
import StudentSupportTab from "@/components/admin/student-profile/StudentSupportTab";
import StudentPerformanceTab from "@/components/admin/student-profile/StudentPerformanceTab";
import StudentActivityTab from "@/components/admin/student-profile/StudentActivityTab";
import StudentAIInsightsTab from "@/components/admin/student-profile/StudentAIInsightsTab";
import StudentQuickActions from "@/components/admin/student-profile/StudentQuickActions";

export interface StudentBundle {
  profile: any;
  role: string | null;
  subscriptions: any[];
  bookings: any[];
  sessions: any[];
  payments: any[];
  tickets: any[];
  warnings: any[];
  points: any | null;
  badges: any[];
  reviews: any[];
  notifications: any[];
  lastLogin?: string | null;
}

const AdminStudentProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const access = useAdminPermissions();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StudentBundle | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (!id) return;
    loadStudent();
    // eslint-disable-next-line
  }, [id]);

  const loadStudent = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [
        profileRes, roleRes, subsRes, bookingsRes, paymentsRes,
        ticketsRes, warningsRes, pointsRes, badgesRes, reviewsRes,
        notificationsRes, eventsRes,
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", id).maybeSingle(),
        supabase.from("user_subscriptions").select("*, subscription_plans(*)").eq("user_id", id).order("created_at", { ascending: false }),
        supabase.from("bookings").select("*, subjects(name)").eq("student_id", id).order("scheduled_at", { ascending: false }).limit(100),
        supabase.from("payment_records").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
        supabase.from("support_tickets").select("*, support_messages(count)").eq("user_id", id).order("created_at", { ascending: false }),
        supabase.from("user_warnings").select("*").eq("user_id", id).order("created_at", { ascending: false }),
        supabase.from("student_points").select("*").eq("user_id", id).maybeSingle(),
        supabase.from("student_badges").select("*, badges(*)").eq("user_id", id),
        supabase.from("reviews").select("*").eq("student_id", id).order("created_at", { ascending: false }).limit(20),
        supabase.from("notifications").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(30),
        supabase.from("session_events").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
      ]);

      if (!profileRes.data) {
        toast.error("لم يتم العثور على الطالب");
        navigate("/admin?tab=users");
        return;
      }

      const bookingIds = (bookingsRes.data || []).map((b: any) => b.id);
      let sessionsData: any[] = [];
      if (bookingIds.length > 0) {
        const { data: sd } = await supabase
          .from("sessions")
          .select("*")
          .in("booking_id", bookingIds)
          .order("created_at", { ascending: false });
        sessionsData = sd || [];
      }

      const lastLogin = (eventsRes.data || []).find((e: any) => e.event_type === "login")?.created_at || null;

      setData({
        profile: profileRes.data,
        role: roleRes.data?.role || null,
        subscriptions: subsRes.data || [],
        bookings: bookingsRes.data || [],
        sessions: sessionsData,
        payments: paymentsRes.data || [],
        tickets: ticketsRes.data || [],
        warnings: warningsRes.data || [],
        points: pointsRes.data,
        badges: badgesRes.data || [],
        reviews: reviewsRes.data || [],
        notifications: notificationsRes.data || [],
        lastLogin,
      });
    } catch (e: any) {
      console.error(e);
      toast.error("فشل تحميل ملف الطالب");
    } finally {
      setLoading(false);
    }
  };

  const generateAISummary = async () => {
    if (!id || !data) return;
    setAiLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("student-ai-summary", {
        body: {
          student_id: id,
          stats: {
            total_bookings: data.bookings.length,
            completed: data.bookings.filter((b: any) => b.status === "completed").length,
            cancelled: data.bookings.filter((b: any) => b.status === "cancelled").length,
            active_sub: data.subscriptions.find((s: any) => s.is_active),
            open_tickets: data.tickets.filter((t: any) => t.status !== "closed").length,
            unpaid_payments: data.payments.filter((p: any) => p.status === "pending").length,
            warnings: data.warnings.length,
            points: data.points?.total_points || 0,
          },
        },
      });
      if (error) throw error;
      setAiSummary(res?.summary || "لم يتمكن AI من إنشاء ملخص");
    } catch (e: any) {
      toast.error("تعذر إنشاء الملخص الذكي");
    } finally {
      setAiLoading(false);
    }
  };

  // Smart alerts derived from data
  const alerts = (() => {
    if (!data) return [] as { kind: string; label: string; tone: string }[];
    const out: { kind: string; label: string; tone: string }[] = [];
    const activeSub = data.subscriptions.find((s: any) => s.is_active);
    if (activeSub) {
      const remaining = activeSub.remaining_minutes ?? 0;
      if (remaining <= 30) out.push({ kind: "sub", label: `الاشتراك على وشك النفاد (${remaining} دقيقة)`, tone: "destructive" });
      const endsAt = activeSub.ends_at ? new Date(activeSub.ends_at).getTime() : null;
      if (endsAt && endsAt - Date.now() < 3 * 86400000) out.push({ kind: "expiry", label: "اقتراب انتهاء الاشتراك", tone: "warning" });
    } else {
      out.push({ kind: "no_sub", label: "لا يوجد اشتراك فعّال", tone: "warning" });
    }
    const failedPayments = data.payments.filter((p: any) => p.status === "failed").length;
    if (failedPayments > 0) out.push({ kind: "pay", label: `${failedPayments} عملية دفع فاشلة`, tone: "destructive" });
    const openTickets = data.tickets.filter((t: any) => t.status !== "closed").length;
    if (openTickets > 0) out.push({ kind: "ticket", label: `${openTickets} تذكرة دعم مفتوحة`, tone: "warning" });
    if (data.warnings.length >= 3) out.push({ kind: "warn", label: `${data.warnings.length} مخالفات مسجلة`, tone: "destructive" });
    return out;
  })();

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center">
        <BrandLoader />
      </div>
    );
  }

  if (!data) return null;

  const p = data.profile;
  const accountStatus = (() => {
    const banned = data.warnings.find((w: any) => w.is_banned);
    if (banned) return { label: "موقوف", color: "bg-destructive/15 text-destructive border-destructive/30" };
    const activeSub = data.subscriptions.find((s: any) => s.is_active);
    if (!activeSub) return { label: "بدون اشتراك", color: "bg-muted text-muted-foreground border-border" };
    const remaining = activeSub.remaining_minutes ?? 0;
    if (remaining <= 0) return { label: "منتهي الاشتراك", color: "bg-orange-500/15 text-orange-600 border-orange-500/30" };
    return { label: "نشط", color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" };
  })();

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border/60 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center gap-3 mb-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin?tab=users")} className="gap-1">
              <ArrowRight className="h-4 w-4" />
              <span className="hidden sm:inline">العودة للمستخدمين</span>
            </Button>
            <div className="text-sm text-muted-foreground">/ ملف الطالب الكامل</div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <Avatar className="h-16 w-16 md:h-20 md:w-20 ring-4 ring-primary/10">
              <AvatarImage src={p.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                {(p.full_name || "ط").slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold truncate">{p.full_name || "بدون اسم"}</h1>
                <Badge variant="outline" className={accountStatus.color}>{accountStatus.label}</Badge>
                <Badge variant="outline" className="text-xs">{data.role || "student"}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {p.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</span>}
                {p.teaching_stage && <span className="flex items-center gap-1"><GraduationCap className="h-3 w-3" />{p.teaching_stage}</span>}
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />منذ {new Date(p.created_at).toLocaleDateString("ar-SA")}</span>
                {data.lastLogin && <span className="flex items-center gap-1"><Activity className="h-3 w-3" />آخر دخول {new Date(data.lastLogin).toLocaleDateString("ar-SA")}</span>}
                <span className="font-mono opacity-70">ID: {id?.slice(0, 8)}</span>
              </div>
            </div>

            <StudentQuickActions studentId={id!} profile={p} onChanged={loadStudent} />
          </div>

          {/* AI Quick Summary + Smart Alerts */}
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card className="lg:col-span-2 border-primary/20 bg-gradient-to-l from-primary/5 via-background to-secondary/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
                    <Sparkles className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3 className="font-bold text-sm">ملخص ذكي</h3>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={generateAISummary} disabled={aiLoading}>
                        <Brain className="h-3 w-3 ml-1" />
                        {aiLoading ? "جاري التحليل..." : aiSummary ? "تحديث" : "إنشاء ملخص AI"}
                      </Button>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
                      {aiSummary || `الطالب لديه ${data.bookings.length} حجز إجمالي، ${data.bookings.filter((b: any) => b.status === "completed").length} مكتمل. ${data.subscriptions.find((s: any) => s.is_active) ? `اشتراك نشط مع ${data.subscriptions.find((s: any) => s.is_active)?.remaining_minutes || 0} دقيقة متبقية.` : "لا يوجد اشتراك نشط."} ${data.tickets.length > 0 ? `${data.tickets.length} تذكرة دعم.` : ""} اضغط زر "إنشاء ملخص AI" للحصول على تحليل ذكي مفصّل.`}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-warning/30 bg-gradient-to-br from-amber-500/5 to-transparent">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <h3 className="font-bold text-sm">تنبيهات ذكية</h3>
                  {alerts.length > 0 && <Badge variant="destructive" className="h-5 text-[10px]">{alerts.length}</Badge>}
                </div>
                {alerts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">✓ لا توجد تنبيهات حالياً</p>
                ) : (
                  <ul className="space-y-1.5">
                    {alerts.slice(0, 4).map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <AlertTriangle className={`h-3 w-3 mt-0.5 shrink-0 ${a.tone === "destructive" ? "text-destructive" : "text-amber-500"}`} />
                        <span>{a.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap h-auto p-1 bg-muted/50">
            <TabsTrigger value="overview" className="gap-1.5 whitespace-nowrap"><Activity className="h-4 w-4" />نظرة عامة</TabsTrigger>
            <TabsTrigger value="subscriptions" className="gap-1.5 whitespace-nowrap"><CreditCard className="h-4 w-4" />الاشتراكات</TabsTrigger>
            <TabsTrigger value="sessions" className="gap-1.5 whitespace-nowrap"><BookOpen className="h-4 w-4" />الحصص</TabsTrigger>
            <TabsTrigger value="performance" className="gap-1.5 whitespace-nowrap"><ClipboardList className="h-4 w-4" />الأداء</TabsTrigger>
            <TabsTrigger value="payments" className="gap-1.5 whitespace-nowrap"><Wallet className="h-4 w-4" />المدفوعات</TabsTrigger>
            <TabsTrigger value="support" className="gap-1.5 whitespace-nowrap"><LifeBuoy className="h-4 w-4" />الدعم</TabsTrigger>
            <TabsTrigger value="activity" className="gap-1.5 whitespace-nowrap"><Bell className="h-4 w-4" />النشاط</TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5 whitespace-nowrap"><Brain className="h-4 w-4" />تحليل AI</TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <TabsContent value="overview" className="m-0"><StudentOverviewTab data={data} /></TabsContent>
            <TabsContent value="subscriptions" className="m-0"><StudentSubscriptionsTab data={data} studentId={id!} onRefresh={loadStudent} /></TabsContent>
            <TabsContent value="sessions" className="m-0"><StudentSessionsTab data={data} /></TabsContent>
            <TabsContent value="performance" className="m-0"><StudentPerformanceTab data={data} /></TabsContent>
            <TabsContent value="payments" className="m-0"><StudentPaymentsTab data={data} /></TabsContent>
            <TabsContent value="support" className="m-0"><StudentSupportTab data={data} studentId={id!} /></TabsContent>
            <TabsContent value="activity" className="m-0"><StudentActivityTab data={data} /></TabsContent>
            <TabsContent value="ai" className="m-0"><StudentAIInsightsTab data={data} studentId={id!} /></TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminStudentProfile;
