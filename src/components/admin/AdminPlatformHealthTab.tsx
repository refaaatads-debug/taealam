import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, RefreshCw, ShieldCheck, Users, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type HealthStatus = "healthy" | "warning" | "error";

type TableCheck = {
  key: string;
  label: string;
  count: number | null;
  status: HealthStatus;
  message: string;
};

type QualityMetric = {
  label: string;
  value: number;
  status: HealthStatus;
  detail: string;
  tab?: string;
};

const TABLES = [
  { key: "profiles", label: "المستخدمون", table: "profiles" },
  { key: "bookings", label: "الحجوزات", table: "bookings" },
  { key: "sessions", label: "الجلسات", table: "sessions" },
  { key: "support", label: "تذاكر الدعم", table: "support_tickets" },
  { key: "payments", label: "المدفوعات", table: "payment_records" },
  { key: "assignments", label: "الواجبات والاختبارات", table: "assignments" },
];

const statusMeta: Record<HealthStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  healthy: { label: "سليم", className: "text-emerald-700 bg-emerald-500/10 border-emerald-500/25", icon: CheckCircle2 },
  warning: { label: "يحتاج مراجعة", className: "text-amber-700 bg-amber-500/10 border-amber-500/25", icon: AlertTriangle },
  error: { label: "فشل الفحص", className: "text-destructive bg-destructive/10 border-destructive/25", icon: XCircle },
};

interface Props {
  onNavigateTab?: (tab: string) => void;
}

const AdminPlatformHealthTab = ({ onNavigateTab }: Props) => {
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [tableChecks, setTableChecks] = useState<TableCheck[]>([]);
  const [quality, setQuality] = useState<QualityMetric[]>([]);

  const runHealthCheck = useCallback(async () => {
    setLoading(true);
    const checks = await Promise.all(TABLES.map(async (item) => {
      const { count, error } = await (supabase as any)
        .from(item.table)
        .select("id", { count: "exact", head: true });
      return {
        key: item.key,
        label: item.label,
        count: error ? null : (count ?? 0),
        status: error ? "error" : "healthy",
        message: error ? "تعذر قراءة الجدول" : "الاتصال والقراءة يعملان",
      } as TableCheck;
    }));

    const now = new Date();
    const oldPendingSince = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const [
      emptyNamesRes,
      oldBookingsRes,
      openSupportRes,
      unreviewedRes,
      studentsRes,
      bookedStudentsRes,
    ] = await Promise.all([
      (supabase as any).from("profiles").select("id", { count: "exact", head: true }).eq("full_name", ""),
      (supabase as any).from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending").lt("created_at", oldPendingSince),
      (supabase as any).from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open").lt("created_at", oldPendingSince),
      (supabase as any).from("violations").select("id", { count: "exact", head: true }).eq("is_reviewed", false),
      (supabase as any).from("user_roles").select("user_id").eq("role", "student"),
      (supabase as any).from("bookings").select("student_id"),
    ]);

    const studentIds = new Set((studentsRes.data || []).map((row: any) => row.user_id));
    const bookedStudentIds = new Set((bookedStudentsRes.data || []).map((row: any) => row.student_id).filter(Boolean));
    const studentsWithoutBookings = [...studentIds].filter((id) => !bookedStudentIds.has(id)).length;
    const metric = (label: string, value: number, detail: string, tab?: string): QualityMetric => ({
      label,
      value,
      status: value === 0 ? "healthy" : "warning",
      detail,
      tab,
    });

    setTableChecks(checks);
    setQuality([
      metric("ملفات بلا اسم", emptyNamesRes.error ? 0 : (emptyNamesRes.count ?? 0), "راجعها من إدارة المستخدمين", "users"),
      metric("حجوزات معلقة لأكثر من 24 ساعة", oldBookingsRes.error ? 0 : (oldBookingsRes.count ?? 0), "تحتاج قرارًا أو متابعة", "bookings"),
      metric("تذاكر دعم متأخرة", openSupportRes.error ? 0 : (openSupportRes.count ?? 0), "تجاوزت يومًا دون إغلاق", "support"),
      metric("طلاب بلا حجوزات", studentsRes.error || bookedStudentsRes.error ? 0 : studentsWithoutBookings, "قد تكون حسابات تجريبية أو غير مكتملة", "student_profiles"),
      metric("مخالفات غير مراجعة", unreviewedRes.error ? 0 : (unreviewedRes.count ?? 0), "تحتاج مراجعة أمنية", "violations"),
    ]);
    setLastChecked(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    runHealthCheck();
  }, [runHealthCheck]);

  const failedChecks = tableChecks.filter((check) => check.status === "error").length;
  const warningCount = quality.filter((item) => item.status === "warning").reduce((sum, item) => sum + item.value, 0);
  const overallStatus: HealthStatus = failedChecks > 0 ? "error" : warningCount > 0 ? "warning" : "healthy";
  const OverallIcon = statusMeta[overallStatus].icon;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-black">صحة المنصة وجودة البيانات</h2>
          <p className="mt-1 text-sm text-muted-foreground">فحص تشغيلي آمن للاتصال والجداول والمهام المتأخرة — بدون تعديل أي بيانات</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={runHealthCheck} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          فحص الآن
        </Button>
      </div>

      <Card className={`border-2 ${overallStatus === "healthy" ? "border-emerald-500/20 bg-emerald-500/[0.03]" : overallStatus === "warning" ? "border-amber-500/25 bg-amber-500/[0.03]" : "border-destructive/25 bg-destructive/[0.03]"}`}>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${overallStatus === "healthy" ? "bg-emerald-500/10 text-emerald-700" : overallStatus === "warning" ? "bg-amber-500/10 text-amber-700" : "bg-destructive/10 text-destructive"}`}>
            <OverallIcon className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">الحالة العامة</p>
            <h3 className="mt-1 text-xl font-black">{statusMeta[overallStatus].label}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {failedChecks > 0 ? `${failedChecks} فحوصات فشلت وتحتاج تدخلًا` : warningCount > 0 ? `${warningCount} عناصر تحتاج متابعة تشغيلية` : "الاتصال الأساسي سليم ولا توجد مؤشرات جودة معلقة"}
            </p>
          </div>
          <Badge variant="outline" className={`${statusMeta[overallStatus].className} gap-1.5`}>
            <Activity className="h-3.5 w-3.5" />
            {lastChecked ? `آخر فحص ${lastChecked.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}` : "جاري الفحص"}
          </Badge>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h3 className="font-bold">اتصال الجداول الأساسية</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tableChecks.map((check) => {
            const meta = statusMeta[check.status];
            const Icon = meta.icon;
            return (
              <Card key={check.key}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${check.status === "healthy" ? "bg-emerald-500/10 text-emerald-700" : "bg-destructive/10 text-destructive"}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{check.label}</p>
                    <p className="text-xs text-muted-foreground">{check.message}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">{check.count == null ? "—" : check.count}</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-secondary" />
          <h3 className="font-bold">جودة البيانات والمهام المتأخرة</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quality.map((item) => {
            const meta = statusMeta[item.status];
            const Icon = meta.icon;
            return (
              <Card key={item.label} className={item.status === "warning" ? "border-amber-500/20" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.status === "healthy" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>
                      {item.label.includes("طلاب") ? <Users className="h-4 w-4" /> : item.label.includes("24") ? <Clock3 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span className={`text-2xl font-black ${item.status === "healthy" ? "text-emerald-700" : "text-amber-700"}`}>{item.value}</span>
                  </div>
                  <p className="mt-3 text-sm font-bold">{item.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                  {item.value > 0 && item.tab && onNavigateTab && (
                    <Button variant="link" className="mt-2 h-auto p-0 text-xs" onClick={() => onNavigateTab(item.tab)}>
                      فتح القسم ومراجعة العناصر
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default AdminPlatformHealthTab;