import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BrandLoader from "@/components/BrandLoader";
import {
  ArrowRight, Phone, Calendar, GraduationCap, Sparkles, AlertTriangle, Bell, Wallet,
  Activity, BookOpen, ClipboardList, CreditCard, LifeBuoy, Brain, Zap, Star, CheckCircle2, XCircle, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import TeacherSessionsTab from "@/components/admin/TeacherSessionsTab";
import { ar } from "date-fns/locale";

interface TeacherBundle {
  profile: any;
  teacher: any;
  subjects: string[];
  certificates: any[];
  bookings: any[];
  sessions: any[];
  earnings: any[];
  withdrawals: any[];
  payments: any[];
  bookingRequests: any[];
  callLogs: any[];
  walletTransactions: any[];
  wallet: any | null;
  reviews: any[];
  tickets: any[];
  warnings: any[];
  notifications: any[];
  lastLogin?: string | null;
}

const AdminTeacherProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TeacherBundle | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (!id) return;
    loadTeacher();
    // eslint-disable-next-line
  }, [id]);

  const loadTeacher = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [profileRes, teacherRes, bookingsRes, ticketsRes, reviewsRes, notificationsRes, eventsRes, warningsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", id).maybeSingle(),
        supabase.from("teacher_profiles").select("*").eq("user_id", id).maybeSingle(),
        supabase.from("bookings").select("*, subjects(name)").eq("teacher_id", id).order("scheduled_at", { ascending: false }).limit(100),
        supabase.from("support_tickets").select("*").eq("user_id", id).order("created_at", { ascending: false }),
        supabase.from("reviews").select("*").eq("teacher_id", id).order("created_at", { ascending: false }).limit(30),
        supabase.from("notifications").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(30),
        supabase.from("session_events").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
        supabase.from("user_warnings").select("*").eq("user_id", id).order("created_at", { ascending: false }),
      ]);

      if (!profileRes.data) {
        toast.error("لم يتم العثور على المعلم");
        navigate("/admin?tab=teacher_profiles");
        return;
      }

      const tpId = teacherRes.data?.id;
      const [subjectsRes, certsRes, earningsRes, withdrawalsRes, paymentsRes, bookingRequestsRes, callLogsRes, walletTxRes, walletRes] = await Promise.all([
        tpId ? supabase.from("teacher_subjects").select("subjects(name)").eq("teacher_id", tpId) : Promise.resolve({ data: [] as any[] }),
        supabase.from("teacher_certificates" as any).select("*").eq("teacher_id", id),
        supabase.from("teacher_earnings").select("*").eq("teacher_id", id).order("created_at", { ascending: false }).limit(50),
        supabase.from("withdrawal_requests" as any).select("*").eq("teacher_id", id).order("created_at", { ascending: false }).limit(20),
        supabase.from("teacher_payments").select("*").eq("teacher_id", id).order("created_at", { ascending: false }).limit(50),
        supabase.from("booking_requests").select("id, student_id, subject_id, scheduled_at, accepted_by, status").eq("accepted_by", id).order("scheduled_at", { ascending: false }),
        (supabase.from as any)("call_logs").select("*").eq("teacher_id", id).order("created_at", { ascending: false }).limit(100),
        (supabase.from as any)("wallet_transactions").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(100),
        (supabase.from as any)("wallets").select("*").eq("user_id", id).maybeSingle(),
      ]);

      const bookingIds = (bookingsRes.data || []).map((b: any) => b.id);
      let sessionsData: any[] = [];
      if (bookingIds.length > 0) {
        const { data: sd } = await supabase.from("sessions").select("*").in("booking_id", bookingIds).order("created_at", { ascending: false });
        sessionsData = sd || [];
      }

      const lastLogin = (eventsRes.data || []).find((e: any) => e.event_type === "login")?.created_at || null;

      setData({
        profile: profileRes.data,
        teacher: teacherRes.data,
        subjects: ((subjectsRes.data || []) as any[]).map((s: any) => s.subjects?.name).filter(Boolean),
        certificates: (certsRes.data as any[]) || [],
        bookings: bookingsRes.data || [],
        sessions: sessionsData,
        earnings: earningsRes.data || [],
        withdrawals: (withdrawalsRes.data as any[]) || [],
        payments: (paymentsRes.data as any[]) || [],
        bookingRequests: (bookingRequestsRes.data as any[]) || [],
        callLogs: (callLogsRes.data as any[]) || [],
        walletTransactions: (walletTxRes.data as any[]) || [],
        wallet: (walletRes as any).data || null,
        reviews: reviewsRes.data || [],
        tickets: ticketsRes.data || [],
        warnings: warningsRes.data || [],
        notifications: notificationsRes.data || [],
        lastLogin,
      });
    } catch (e: any) {
      console.error(e);
      toast.error("فشل تحميل ملف المعلم");
    } finally { setLoading(false); }
  };

  const generateAISummary = async () => {
    if (!id || !data) return;
    setAiLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("teacher-ai-summary", {
        body: {
          teacher_id: id,
          stats: {
            total_bookings: data.bookings.length,
            completed: data.bookings.filter((b: any) => b.status === "completed").length,
            cancelled: data.bookings.filter((b: any) => b.status === "cancelled").length,
            avg_rating: data.teacher?.avg_rating || 0,
            total_reviews: data.teacher?.total_reviews || 0,
            balance: data.teacher?.balance || 0,
            hourly_rate: data.teacher?.hourly_rate || 0,
            is_approved: data.teacher?.is_approved,
            warnings: data.warnings.length,
            open_tickets: data.tickets.filter((t: any) => t.status !== "closed").length,
          },
        },
      });
      if (error) throw error;
      setAiSummary(res?.summary || "لم يتمكن AI من إنشاء ملخص");
    } catch (e: any) {
      toast.error("تعذر إنشاء الملخص الذكي");
    } finally { setAiLoading(false); }
  };

  const toggleApproval = async () => {
    if (!data?.teacher) return;
    const next = !data.teacher.is_approved;
    const { error } = await supabase.from("teacher_profiles").update({ is_approved: next, is_verified: next }).eq("id", data.teacher.id);
    if (error) { toast.error("فشل التحديث"); return; }
    toast.success(next ? "تمت الموافقة على المعلم" : "تم إلغاء اعتماد المعلم");
    loadTeacher();
  };

  if (loading) return <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center"><BrandLoader /></div>;
  if (!data) return null;

  const p = data.profile;
  const t = data.teacher || {};
  const completedSessions = data.bookings.filter((b: any) => b.status === "completed").length;
  const cancelledSessions = data.bookings.filter((b: any) => b.status === "cancelled").length;

  const accountStatus = (() => {
    const banned = data.warnings.find((w: any) => w.is_banned);
    if (banned) return { label: "موقوف", color: "bg-destructive/15 text-destructive border-destructive/30" };
    if (!t.is_approved) return { label: "بانتظار الموافقة", color: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
    return { label: "معتمد ونشط", color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" };
  })();

  const alerts: { label: string; tone: string }[] = [];
  if (!t.is_approved) alerts.push({ label: "المعلم غير معتمد بعد", tone: "warning" });
  if (data.warnings.length >= 3) alerts.push({ label: `${data.warnings.length} مخالفات مسجلة`, tone: "destructive" });
  const openTickets = data.tickets.filter((tk: any) => tk.status !== "closed").length;
  if (openTickets > 0) alerts.push({ label: `${openTickets} تذكرة دعم مفتوحة`, tone: "warning" });
  const pendingWithdrawals = data.withdrawals.filter((w: any) => w.status === "pending").length;
  if (pendingWithdrawals > 0) alerts.push({ label: `${pendingWithdrawals} طلب سحب معلّق`, tone: "warning" });

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border/60 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center gap-3 mb-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin?tab=teacher_profiles")} className="gap-1">
              <ArrowRight className="h-4 w-4" />
              <span className="hidden sm:inline">العودة للمعلمين</span>
            </Button>
            <div className="text-sm text-muted-foreground">/ ملف المعلم الكامل</div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <Avatar className="h-16 w-16 md:h-20 md:w-20 ring-4 ring-primary/10">
              <AvatarImage src={p.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                {(p.full_name || "م").slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold truncate">{p.full_name || "بدون اسم"}</h1>
                <Badge variant="outline" className={accountStatus.color}>{accountStatus.label}</Badge>
                {Number(t.avg_rating || 0) > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                    {Number(t.avg_rating).toFixed(1)} ({t.total_reviews || 0})
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {p.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</span>}
                {data.subjects.length > 0 && <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" />{data.subjects.join("، ")}</span>}
                {(t.teaching_stages || []).length > 0 && <span className="flex items-center gap-1"><GraduationCap className="h-3 w-3" />{(t.teaching_stages || []).join("، ")}</span>}
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />منذ {new Date(p.created_at).toLocaleDateString("ar-SA")}</span>
                {data.lastLogin && <span className="flex items-center gap-1"><Activity className="h-3 w-3" />آخر دخول {new Date(data.lastLogin).toLocaleDateString("ar-SA")}</span>}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button size="sm" variant={t.is_approved ? "outline" : "default"} onClick={toggleApproval} className="gap-1">
                {t.is_approved ? <><XCircle className="h-4 w-4" />إلغاء الاعتماد</> : <><CheckCircle2 className="h-4 w-4" />اعتماد المعلم</>}
              </Button>
            </div>
          </div>

          {/* AI Summary + Alerts */}
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
                      {aiSummary || `المعلم لديه ${data.bookings.length} حجز إجمالي، ${completedSessions} مكتمل و${cancelledSessions} ملغي. التقييم: ${Number(t.avg_rating || 0).toFixed(1)}/5 من ${t.total_reviews || 0} مراجعة. الرصيد الحالي: ${Number(t.balance || 0).toFixed(2)} ر.س. ${data.warnings.length > 0 ? `${data.warnings.length} مخالفات.` : ""} اضغط زر "إنشاء ملخص AI" للحصول على تحليل مفصّل.`}
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
            <TabsTrigger value="sessions" className="gap-1.5 whitespace-nowrap"><BookOpen className="h-4 w-4" />الحصص</TabsTrigger>
            <TabsTrigger value="reviews" className="gap-1.5 whitespace-nowrap"><Star className="h-4 w-4" />التقييمات</TabsTrigger>
            <TabsTrigger value="finance" className="gap-1.5 whitespace-nowrap"><Wallet className="h-4 w-4" />المالية</TabsTrigger>
            <TabsTrigger value="wallet" className="gap-1.5 whitespace-nowrap"><Phone className="h-4 w-4" />محفظة المكالمات</TabsTrigger>
            <TabsTrigger value="support" className="gap-1.5 whitespace-nowrap"><LifeBuoy className="h-4 w-4" />الدعم</TabsTrigger>
            <TabsTrigger value="activity" className="gap-1.5 whitespace-nowrap"><Bell className="h-4 w-4" />النشاط</TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <TabsContent value="overview" className="m-0 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatBox label="إجمالي الحصص" value={t.total_sessions || 0} icon={BookOpen} />
                <StatBox label="مكتملة" value={completedSessions} icon={CheckCircle2} tone="success" />
                <StatBox label="ملغاة" value={cancelledSessions} icon={XCircle} tone="destructive" />
                <StatBox label="الرصيد" value={`${Number(t.balance || 0).toFixed(2)} ر.س`} icon={Wallet} />
              </div>
              <Card>
                <CardHeader><CardTitle className="text-sm">الملف الشخصي</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-2">
                  <Row label="السيرة الذاتية" value={t.bio || "—"} />
                  <Row label="السعر بالساعة" value={`${Number(t.hourly_rate || 0).toFixed(2)} ر.س`} />
                  <Row label="سنوات الخبرة" value={`${t.years_experience || 0} سنة`} />
                  <Row label="الجنسية" value={t.nationality || "—"} />
                  <Row label="المواد" value={data.subjects.join("، ") || "—"} />
                  <Row label="المراحل التعليمية" value={(t.teaching_stages || []).join("، ") || "—"} />
                  <Row label="الأيام المتاحة" value={(t.available_days || []).join("، ") || "—"} />
                  <Row label="ساعات العمل" value={t.available_from && t.available_to ? `${t.available_from} - ${t.available_to}` : "—"} />
                  <Row label="الشهادات" value={`${data.certificates.length} شهادة`} />
                </CardContent>
              </Card>
            </TabsContent>

                        <TabsContent value="sessions" className="m-0">
              <TeacherSessionsTab bookings={data.bookings} sessions={data.sessions} bookingRequests={data.bookingRequests} />
            </TabsContent>

            <TabsContent value="reviews" className="m-0">
              <Card>
                <CardHeader><CardTitle className="text-sm">المراجعات ({data.reviews.length})</CardTitle></CardHeader>
                <CardContent>
                  {data.reviews.length === 0 ? <Empty text="لا مراجعات" /> : (
                    <div className="space-y-2">
                      {data.reviews.map((r: any) => (
                        <div key={r.id} className="p-3 border rounded-lg text-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="gap-1">
                              <Star className="h-3 w-3 fill-amber-500 text-amber-500" />{r.rating}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(r.created_at), "dd MMM yyyy", { locale: ar })}
                            </span>
                          </div>
                          {r.comment && <p className="text-sm">{r.comment}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="finance" className="m-0 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatBox label="الرصيد الحالي" value={Number(t.balance || 0).toFixed(2) + " ر.س"} icon={Wallet} />
                <StatBox label="إجمالي المدفوع" value={data.payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0).toFixed(2) + " ر.س"} icon={CreditCard} tone="success" />
                <StatBox label="سجلات الأرباح" value={data.earnings.length} icon={CreditCard} />
                <StatBox label="طلبا֪ السحب" value={data.withdrawals.length} icon={Wallet} />
              </div>
              <Card>
                <CardHeader><CardTitle className="text-sm">المدفوعات المنفّذة ({data.payments.length})</CardTitle></CardHeader>
                <CardContent>
                  {data.payments.length === 0 ? <Empty text="لا مدفوعا֪" /> : (
                    <div className="space-y-2">
                      {data.payments.map((p: any) => (
                        <div key={p.id} className="border rounded-lg p-3 text-sm space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-emerald-600">{Number(p.amount).toFixed(2)} ر.س</span>
                            <span className="text-xs text-muted-foreground">{format(new Date(p.created_at), "dd MMM yyyy HH:mm", { locale: ar })}</span>
                          </div>
                          {p.payment_method && (
                            <div className="text-xs text-muted-foreground">طريقة الدفع: <span className="text-foreground font-medium">{p.payment_method}</span></div>
                          )}
                          {p.notes && <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1">{p.notes}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">سجلات الأرباح ({data.earnings.length})</CardTitle></CardHeader>
                <CardContent>
                  {data.earnings.length === 0 ? <Empty text="لا أرباح" /> : (
                    <div className="space-y-3">
                      {data.earnings.map((e: any) => (
                        <div key={e.id} className="border rounded-lg p-3 text-sm space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="font-bold">{e.month || "—"}</div>
                              {e.invoice_id && <div className="text-xs text-muted-foreground">فاتورة: {e.invoice_id}</div>}
                            </div>
                            <Badge variant={e.status === "paid" ? "secondary" : e.status === "pending" ? "outline" : "destructive"} className="text-xs shrink-0">{e.status}</Badge>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className="bg-muted/40 rounded px-2 py-1.5">
                              <div className="text-[10px] text-muted-foreground">الإجمالي</div>
                              <div className="font-bold text-xs">{Number(e.gross_amount || e.amount || 0).toFixed(2)} ر.س</div>
                            </div>
                            <div className="bg-muted/40 rounded px-2 py-1.5">
                              <div className="text-[10px] text-muted-foreground">عمولة المنصة</div>
                              <div className="font-bold text-xs text-destructive">{Number(e.platform_fee || 0).toFixed(2)} ر.س</div>
                            </div>
                            <div className="bg-muted/40 rounded px-2 py-1.5">
                              <div className="text-[10px] text-muted-foreground">ضريبة القيمة</div>
                              <div className="font-bold text-xs text-amber-600">{Number(e.vat_amount || 0).toFixed(2)} ر.س</div>
                            </div>
                            <div className="bg-emerald-500/10 rounded px-2 py-1.5">
                              <div className="text-[10px] text-muted-foreground">الصافي للمعلم</div>
                              <div className="font-black text-xs text-emerald-600">{Number(e.net_amount || e.teacher_base_amount || e.amount || 0).toFixed(2)} ر.س</div>
                            </div>
                          </div>
                          <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
                            {e.total_sessions_snapshot > 0 && <span>الحصص: <b>{e.total_sessions_snapshot}</b></span>}
                            {e.hours > 0 && <span>الساعات: <b>{Number(e.hours).toFixed(1)}</b></span>}
                            {e.minutes_snapshot > 0 && <span>الدقائق: <b>{e.minutes_snapshot}</b></span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">طلبات السحب ({data.withdrawals.length})</CardTitle></CardHeader>
                <CardContent>
                  {data.withdrawals.length === 0 ? <Empty text="لا طلبا֪" /> : (
                    <div className="space-y-2">
                      {data.withdrawals.map((w: any) => (
                        <div key={w.id} className="border rounded-lg p-3 text-sm space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="font-bold">{Number(w.amount).toFixed(2)} ر.س</span>
                              {w.net_amount > 0 && <span className="text-xs text-emerald-600 mr-2">صافي: {Number(w.net_amount).toFixed(2)}</span>}
                              {w.vat_amount > 0 && <span className="text-xs text-muted-foreground mr-2">ضريبة: {Number(w.vat_amount).toFixed(2)}</span>}
                            </div>
                            <Badge variant={w.status === "approved" || w.status === "paid" ? "secondary" : w.status === "rejected" ? "destructive" : "outline"} className="text-xs shrink-0">{w.status}</Badge>
                          </div>
                          <div className="flex gap-3 text-[11px] text-muted-foreground flex-wrap">
                            <span>تاريخ الطلب: {format(new Date(w.created_at), "dd MMM yyyy", { locale: ar })}</span>
                            {w.approved_at && <span>تاريخ الموافقة: {format(new Date(w.approved_at), "dd MMM yyyy", { locale: ar })}</span>}
                            {w.paid_at && <span className="text-emerald-600">تاريخ الدفع: {format(new Date(w.paid_at), "dd MMM yyyy", { locale: ar })}</span>}
                          </div>
                          {w.teacher_notes && <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1">ملاحظات المعلم: {w.teacher_notes}</p>}
                          {w.admin_notes && <p className="text-xs text-primary bg-primary/5 rounded px-2 py-1">ملاحظات الإدارة: {w.admin_notes}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>


            <TabsContent value="wallet" className="m-0 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card><CardContent className="p-4 space-y-1"><div className="text-xs text-muted-foreground">رصيد المحفظة</div><div className="text-2xl font-bold text-emerald-600">{Number(data.wallet?.balance || 0).toFixed(2)} ر.س</div></CardContent></Card>
                <Card><CardContent className="p-4 space-y-1"><div className="text-xs text-muted-foreground">إجمالي المكالمات</div><div className="text-2xl font-bold">{data.callLogs.length}</div></CardContent></Card>
                <Card><CardContent className="p-4 space-y-1"><div className="text-xs text-muted-foreground">مكالمات ناجحة</div><div className="text-2xl font-bold text-emerald-600">{data.callLogs.filter((c: any) => c.status === "completed").length}</div></CardContent></Card>
                <Card><CardContent className="p-4 space-y-1"><div className="text-xs text-muted-foreground">إجمالي التكلفة</div><div className="text-2xl font-bold text-amber-600">{data.callLogs.reduce((s: number, c: any) => s + Number(c.cost || 0), 0).toFixed(2)} ر.س</div></CardContent></Card>
              </div>

              <Card>
                <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">حركات المحفظة ({data.walletTransactions.length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {data.walletTransactions.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">لا توجد حركات</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs text-muted-foreground">
                          <tr>
                            <th className="text-right p-3">التاريخ</th>
                            <th className="text-right p-3">النوع</th>
                            <th className="text-right p-3">المبلغ</th>
                            <th className="text-right p-3">الرصيد بعد</th>
                            <th className="text-right p-3">الوصف</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.walletTransactions.map((tx: any) => (
                            <tr key={tx.id} className="border-t hover:bg-muted/30">
                              <td className="p-3 text-xs">{new Date(tx.created_at).toLocaleDateString("ar-SA")}</td>
                              <td className="p-3"><Badge variant="outline" className={tx.type === "credit" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : "bg-destructive/15 text-destructive border-destructive/30"}>{tx.type === "credit" ? "إيداع" : "خصم"}</Badge></td>
                              <td className="p-3 font-bold">{Number(tx.amount).toFixed(2)}</td>
                              <td className="p-3 text-xs">{Number(tx.balance_after).toFixed(2)}</td>
                              <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate">{tx.description || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">سجل المكالمات ({data.callLogs.length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {data.callLogs.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">لا توجد مكالمات</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs text-muted-foreground">
                          <tr>
                            <th className="text-right p-3">التاريخ</th>
                            <th className="text-right p-3">المدة الفعلية</th>
                            <th className="text-right p-3">المدة المقدرة</th>
                            <th className="text-right p-3">التكلفة</th>
                            <th className="text-right p-3">الحالة</th>
                            <th className="text-right p-3">ملاحظة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.callLogs.map((cl: any) => (
                            <tr key={cl.id} className="border-t hover:bg-muted/30">
                              <td className="p-3 text-xs">{new Date(cl.created_at).toLocaleDateString("ar-SA")}</td>
                              <td className="p-3 font-bold">{Number(cl.duration_minutes).toFixed(1)} د</td>
                              <td className="p-3 text-xs">{cl.estimated_minutes} د</td>
                              <td className="p-3 font-bold text-amber-600">{Number(cl.cost).toFixed(2)} ر.س</td>
                              <td className="p-3"><Badge variant="outline" className={cl.status === "completed" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : cl.status === "failed" ? "bg-destructive/15 text-destructive border-destructive/30" : "bg-muted text-muted-foreground border-border"}>{cl.status === "completed" ? "ناجحة" : cl.status === "failed" ? "فاشلة" : cl.status}</Badge></td>
                              <td className="p-3 text-[10px] text-muted-foreground max-w-[150px] truncate">{cl.error_message || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="support" className="m-0">
              <Card>
                <CardHeader><CardTitle className="text-sm">تذاكر الدعم ({data.tickets.length})</CardTitle></CardHeader>
                <CardContent>
                  {data.tickets.length === 0 ? <Empty text="لا تذاكر" /> : (
                    <div className="space-y-2">
                      {data.tickets.map((t: any) => (
                        <div key={t.id} className="flex items-center justify-between p-2 border rounded-lg text-sm">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{t.subject}</div>
                            <div className="text-xs text-muted-foreground">{format(new Date(t.created_at), "dd MMM yyyy", { locale: ar })}</div>
                          </div>
                          <Badge variant={t.status === "closed" ? "outline" : t.status === "open" ? "default" : "secondary"}>{t.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="m-0">
              <Card>
                <CardHeader><CardTitle className="text-sm">آخر الإشعارات</CardTitle></CardHeader>
                <CardContent>
                  {data.notifications.length === 0 ? <Empty text="لا إشعارات" /> : (
                    <div className="space-y-2">
                      {data.notifications.map((n: any) => (
                        <div key={n.id} className="p-2 border rounded-lg text-sm">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium">{n.title}</span>
                            <span className="text-xs text-muted-foreground mr-auto">{format(new Date(n.created_at), "dd MMM HH:mm", { locale: ar })}</span>
                          </div>
                          {n.body && <p className="text-xs text-muted-foreground mt-1">{n.body}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

const StatBox = ({ label, value, icon: Icon, tone }: { label: string; value: any; icon: any; tone?: string }) => (
  <Card>
    <CardContent className="p-3 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tone === "success" ? "bg-emerald-500/10 text-emerald-600" : tone === "destructive" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className="font-bold truncate">{value}</div>
      </div>
    </CardContent>
  </Card>
);

const Row = ({ label, value }: { label: string; value: any }) => (
  <div className="flex items-start justify-between gap-3 py-1.5 border-b last:border-0">
    <span className="text-muted-foreground shrink-0">{label}</span>
    <span className="text-foreground text-left">{value}</span>
  </div>
);

const Empty = ({ text }: { text: string }) => (
  <div className="text-center py-8 text-sm text-muted-foreground">{text}</div>
);

export default AdminTeacherProfile;
