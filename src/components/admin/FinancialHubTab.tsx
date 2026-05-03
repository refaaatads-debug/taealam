import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ShieldCheck, AlertTriangle, RefreshCw, Lock, FileText, TrendingUp, Download, Search, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FinancialExportButton from "./FinancialExportButton";
import { inDateRange } from "@/lib/financialExports";


interface FinancialSettings {
  id: string;
  vat_rate: number;
  platform_fee_rate: number;
  min_withdrawal_amount: number;
  auto_close_months_after_days: number;
  large_withdrawal_threshold: number;
  enable_auto_reconciliation: boolean;
}

export default function FinancialHubTab() {
  const [settings, setSettings] = useState<FinancialSettings | null>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [reconciliations, setReconciliations] = useState<any[]>([]);
  const [withdrawalHistory, setWithdrawalHistory] = useState<any[]>([]);
  const [platformSummary, setPlatformSummary] = useState<any | null>(null);
  const [platformMonth, setPlatformMonth] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditAction, setAuditAction] = useState<string>("all");
  const [auditEntity, setAuditEntity] = useState<string>("all");
  const [auditFrom, setAuditFrom] = useState<string>("");
  const [auditTo, setAuditTo] = useState<string>("");
  const [recFrom, setRecFrom] = useState<string>("");
  const [recTo, setRecTo] = useState<string>("");
  const [recStatus, setRecStatus] = useState<string>("all");
  const [histFrom, setHistFrom] = useState<string>("");
  const [histTo, setHistTo] = useState<string>("");
  const [histStatus, setHistStatus] = useState<string>("all");

  useEffect(() => {
    void loadAll();
    void loadPlatformSummary();
  }, []);

  const loadPlatformSummary = async (month?: string) => {
    try {
      const { data, error } = await supabase.rpc("get_platform_revenue_summary" as any, {
        _month: month && month.length > 0 ? month : null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setPlatformSummary(row || null);
    } catch (e: any) {
      toast.error("فشل تحميل أرباح المنصة: " + e.message);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, a, r, h] = await Promise.all([
        supabase.from("financial_settings" as any).select("*").maybeSingle(),
        supabase.from("financial_audit_log" as any).select("*").order("created_at", { ascending: false }).limit(2000),
        supabase.from("financial_reconciliation" as any).select("*").order("created_at", { ascending: false }).limit(20),
        supabase.from("withdrawal_status_history" as any).select("*").order("created_at", { ascending: false }).limit(30),
      ]);
      if (s.data) setSettings(s.data as any);
      setAuditLog((a.data as any[]) || []);
      setReconciliations((r.data as any[]) || []);
      setWithdrawalHistory((h.data as any[]) || []);
    } catch (e: any) {
      toast.error("فشل تحميل البيانات: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("financial_settings" as any)
        .update({
          vat_rate: settings.vat_rate,
          platform_fee_rate: settings.platform_fee_rate,
          min_withdrawal_amount: settings.min_withdrawal_amount,
          auto_close_months_after_days: settings.auto_close_months_after_days,
          large_withdrawal_threshold: settings.large_withdrawal_threshold,
          enable_auto_reconciliation: settings.enable_auto_reconciliation,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settings.id);
      if (error) throw error;
      toast.success("تم حفظ الإعدادات");
    } catch (e: any) {
      toast.error("فشل الحفظ: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const runReconciliation = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.rpc("run_financial_reconciliation" as any);
      if (error) throw error;
      toast.success("تمت المطابقة بنجاح");
      await loadAll();
    } catch (e: any) {
      toast.error("فشل تشغيل المطابقة: " + e.message);
    } finally {
      setRunning(false);
    }
  };

  const runAutoClose = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.rpc("auto_close_old_financial_months" as any);
      if (error) throw error;
      toast.success(`تم إغلاق ${data || 0} شهر`);
      await loadAll();
    } catch (e: any) {
      toast.error("فشل: " + e.message);
    } finally {
      setRunning(false);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === "ok") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
    if (status === "minor_drift") return "bg-amber-500/10 text-amber-600 border-amber-500/30";
    return "bg-rose-500/10 text-rose-600 border-rose-500/30";
  };

  const uniqueActions = useMemo(() => Array.from(new Set(auditLog.map((a) => a.action).filter(Boolean))), [auditLog]);
  const uniqueEntities = useMemo(() => Array.from(new Set(auditLog.map((a) => a.entity_type).filter(Boolean))), [auditLog]);

  const filteredAudit = useMemo(() => {
    return auditLog.filter((a) => {
      if (auditAction !== "all" && a.action !== auditAction) return false;
      if (auditEntity !== "all" && a.entity_type !== auditEntity) return false;
      if (auditFrom && new Date(a.created_at) < new Date(auditFrom)) return false;
      if (auditTo) {
        const to = new Date(auditTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(a.created_at) > to) return false;
      }
      if (auditSearch) {
        const q = auditSearch.toLowerCase();
        const hay = `${a.action || ""} ${a.entity_type || ""} ${a.entity_id || ""} ${a.actor_id || ""} ${a.actor_role || ""} ${JSON.stringify(a.metadata || {})}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [auditLog, auditAction, auditEntity, auditFrom, auditTo, auditSearch]);

  const filteredReconciliations = useMemo(() => reconciliations.filter((r) => {
    if (recStatus !== "all" && r.status !== recStatus) return false;
    return inDateRange(r.created_at, recFrom, recTo);
  }), [reconciliations, recFrom, recTo, recStatus]);

  const filteredHistory = useMemo(() => withdrawalHistory.filter((h) => {
    if (histStatus !== "all" && h.to_status !== histStatus) return false;
    return inDateRange(h.created_at, histFrom, histTo);
  }), [withdrawalHistory, histFrom, histTo, histStatus]);

  const auditExportRows = useMemo(() => filteredAudit.map((a) => ({
    created_at: new Date(a.created_at).toLocaleString("ar-SA"),
    action: a.action, entity_type: a.entity_type, entity_id: a.entity_id,
    amount: a.amount ? Number(a.amount).toFixed(2) : "",
    actor_role: a.actor_role || "", actor_id: a.actor_id || "", ip_address: a.ip_address || "",
  })), [filteredAudit]);

  const recExportRows = useMemo(() => filteredReconciliations.map((r) => ({
    created_at: new Date(r.created_at).toLocaleString("ar-SA"),
    expected_total: Number(r.expected_total).toFixed(2),
    actual_total: Number(r.actual_total).toFixed(2),
    difference: Number(r.difference).toFixed(2),
    sessions_count: r.sessions_count,
    status: r.status,
  })), [filteredReconciliations]);

  const historyExportRows = useMemo(() => filteredHistory.map((h) => ({
    created_at: new Date(h.created_at).toLocaleString("ar-SA"),
    from_status: h.from_status || "—", to_status: h.to_status, notes: h.notes || "",
  })), [filteredHistory]);

  const platformExportRows = useMemo(() => {
    if (!platformSummary) return [];
    return [{
      month: platformMonth || "الكل",
      total_revenue: Number(platformSummary.total_revenue || 0).toFixed(2),
      total_vat: Number(platformSummary.total_vat || 0).toFixed(2),
      total_platform_earnings: Number(platformSummary.total_platform_earnings || 0).toFixed(2),
      total_teacher_payouts: Number(platformSummary.total_teacher_payouts || 0).toFixed(2),
      net_profit: Number(platformSummary.net_profit || 0).toFixed(2),
      invoices_count: platformSummary.invoices_count || 0,
      sessions_count: platformSummary.sessions_count || 0,
      minutes_total: platformSummary.minutes_total || 0,
    }];
  }, [platformSummary, platformMonth]);

  const clearFilters = () => {
    setAuditSearch("");
    setAuditAction("all");
    setAuditEntity("all");
    setAuditFrom("");
    setAuditTo("");
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            المركز المالي
          </h2>
          <p className="text-sm text-muted-foreground">إعدادات وتدقيق ومطابقة مالية</p>
        </div>
        <Button onClick={loadAll} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ml-2 ${loading ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>

      <Tabs defaultValue="platform" className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="platform">
            <TrendingUp className="h-4 w-4 ml-1" />
            أرباح المنصة
          </TabsTrigger>
          <TabsTrigger value="settings">
            <ShieldCheck className="h-4 w-4 ml-1" />
            الإعدادات
          </TabsTrigger>
          <TabsTrigger value="reconciliation">
            <TrendingUp className="h-4 w-4 ml-1" />
            المطابقة
          </TabsTrigger>
          <TabsTrigger value="audit">
            <FileText className="h-4 w-4 ml-1" />
            سجل التدقيق
          </TabsTrigger>
          <TabsTrigger value="history">
            <Lock className="h-4 w-4 ml-1" />
            تتبع السحوبات
          </TabsTrigger>
        </TabsList>

        {/* Platform Revenue */}
        <TabsContent value="platform">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle>أرباح المنصة المالية</CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  type="month"
                  value={platformMonth}
                  onChange={(e) => setPlatformMonth(e.target.value)}
                  className="w-40"
                />
                <Button size="sm" onClick={() => loadPlatformSummary(platformMonth)}>
                  <RefreshCw className="h-4 w-4 ml-2" />
                  تحديث
                </Button>
                {platformMonth && (
                  <Button size="sm" variant="ghost" onClick={() => { setPlatformMonth(""); loadPlatformSummary(""); }}>
                    <X className="h-4 w-4 ml-1" />
                    مسح
                  </Button>
                )}
                <FinancialExportButton
                  title={`Platform Revenue ${platformMonth || "All"}`}
                  filename="platform_revenue"
                  headers={[
                    { key: "month", label: "الشهر" },
                    { key: "total_revenue", label: "إجمالي الإيرادات" },
                    { key: "total_vat", label: "ضريبة محصلة" },
                    { key: "total_platform_earnings", label: "أرباح المنصة" },
                    { key: "total_teacher_payouts", label: "مدفوعات المعلمين" },
                    { key: "net_profit", label: "صافي الربح" },
                    { key: "invoices_count", label: "عدد الفواتير" },
                    { key: "sessions_count", label: "عدد الحصص" },
                    { key: "minutes_total", label: "إجمالي الدقائق" },
                  ]}
                  rows={platformExportRows}
                />
              </div>
            </CardHeader>
            <CardContent>
              {!platformSummary ? (
                <div className="text-center text-muted-foreground py-8">جاري التحميل...</div>
              ) : (
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="rounded-lg border p-4 bg-card">
                    <p className="text-xs text-muted-foreground mb-1">إجمالي الإيرادات</p>
                    <p className="text-2xl font-bold">{Number(platformSummary.total_revenue || 0).toFixed(2)} ر.س</p>
                  </div>
                  <div className="rounded-lg border p-4 bg-card">
                    <p className="text-xs text-muted-foreground mb-1">إجمالي الضريبة المحصلة (VAT)</p>
                    <p className="text-2xl font-bold text-amber-600">{Number(platformSummary.total_vat || 0).toFixed(2)} ر.س</p>
                  </div>
                  <div className="rounded-lg border p-4 bg-card">
                    <p className="text-xs text-muted-foreground mb-1">إجمالي أرباح المنصة (عمولات)</p>
                    <p className="text-2xl font-bold text-primary">{Number(platformSummary.total_platform_earnings || 0).toFixed(2)} ر.س</p>
                  </div>
                  <div className="rounded-lg border p-4 bg-card">
                    <p className="text-xs text-muted-foreground mb-1">إجمالي مدفوعات المعلمين</p>
                    <p className="text-2xl font-bold">{Number(platformSummary.total_teacher_payouts || 0).toFixed(2)} ر.س</p>
                  </div>
                  <div className="rounded-lg border p-4 bg-emerald-500/5">
                    <p className="text-xs text-muted-foreground mb-1">صافي الربح</p>
                    <p className="text-2xl font-bold text-emerald-600">{Number(platformSummary.net_profit || 0).toFixed(2)} ر.س</p>
                  </div>
                  <div className="rounded-lg border p-4 bg-card">
                    <p className="text-xs text-muted-foreground mb-1">عدد الفواتير الصادرة</p>
                    <p className="text-2xl font-bold">{platformSummary.invoices_count || 0}</p>
                  </div>
                  <div className="rounded-lg border p-4 bg-card">
                    <p className="text-xs text-muted-foreground mb-1">عدد الحصص / إجمالي الدقائق</p>
                    <p className="text-2xl font-bold">{platformSummary.sessions_count || 0} / {platformSummary.minutes_total || 0}</p>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-4">
                * يتم احتساب أرباح المنصة تلقائياً من حصص مكتملة (مدتها ≥ 5 دقائق). الضريبة تُخصم من الإجمالي أولاً، ثم تُقسّم بقية الإيرادات بين المنصة والمعلم وفق نسبة العمولة.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings */}
        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>الإعدادات المالية</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {settings && (
                <>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>نسبة ضريبة القيمة المضافة (%)</Label>
                      <Input
                        type="number"
                        value={settings.vat_rate}
                        onChange={(e) => setSettings({ ...settings, vat_rate: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>نسبة عمولة المنصة (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={Number(settings.platform_fee_rate ?? 0) * 100}
                        onChange={(e) => setSettings({ ...settings, platform_fee_rate: Number(e.target.value) / 100 })}
                      />
                      <p className="text-xs text-muted-foreground">النسبة المخصومة من إجمالي قيمة الحصة قبل احتساب الضريبة</p>
                    </div>
                    <div className="space-y-2">
                      <Label>الحد الأدنى للسحب (ريال)</Label>
                      <Input
                        type="number"
                        value={settings.min_withdrawal_amount}
                        onChange={(e) => setSettings({ ...settings, min_withdrawal_amount: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>إغلاق الشهر تلقائياً بعد (أيام)</Label>
                      <Input
                        type="number"
                        value={settings.auto_close_months_after_days}
                        onChange={(e) => setSettings({ ...settings, auto_close_months_after_days: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>حد السحب الكبير (يحتاج مراجعة)</Label>
                      <Input
                        type="number"
                        value={settings.large_withdrawal_threshold}
                        onChange={(e) => setSettings({ ...settings, large_withdrawal_threshold: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <Label>تفعيل المطابقة اليومية التلقائية</Label>
                      <p className="text-xs text-muted-foreground">مقارنة الحصص بالأرباح المسجلة وتنبيه عند وجود فرق</p>
                    </div>
                    <Switch
                      checked={settings.enable_auto_reconciliation}
                      onCheckedChange={(v) => setSettings({ ...settings, enable_auto_reconciliation: v })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={saveSettings} disabled={loading}>
                      {loading && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                      حفظ الإعدادات
                    </Button>
                    <Button variant="outline" onClick={runAutoClose} disabled={running}>
                      <Lock className="h-4 w-4 ml-2" />
                      إغلاق الأشهر القديمة الآن
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reconciliation */}
        <TabsContent value="reconciliation">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle>سجل المطابقة المالية ({filteredReconciliations.length})</CardTitle>
              <div className="flex gap-2">
                <FinancialExportButton
                  title="Financial Reconciliation"
                  filename="financial_reconciliation"
                  headers={[
                    { key: "created_at", label: "التاريخ" },
                    { key: "expected_total", label: "متوقع" },
                    { key: "actual_total", label: "فعلي" },
                    { key: "difference", label: "الفرق" },
                    { key: "sessions_count", label: "عدد الحصص" },
                    { key: "status", label: "الحالة" },
                  ]}
                  rows={recExportRows}
                />
                <Button onClick={runReconciliation} disabled={running} size="sm">
                  {running ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <TrendingUp className="h-4 w-4 ml-2" />}
                  تشغيل مطابقة الآن
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-3 gap-2">
                <Input type="date" value={recFrom} onChange={(e) => setRecFrom(e.target.value)} />
                <Input type="date" value={recTo} onChange={(e) => setRecTo(e.target.value)} />
                <Select value={recStatus} onValueChange={setRecStatus}>
                  <SelectTrigger><SelectValue placeholder="الحالة" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الحالات</SelectItem>
                    <SelectItem value="ok">متطابق</SelectItem>
                    <SelectItem value="minor_drift">فرق بسيط</SelectItem>
                    <SelectItem value="mismatch">تباين</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>متوقع</TableHead>
                    <TableHead>فعلي</TableHead>
                    <TableHead>الفرق</TableHead>
                    <TableHead>عدد الحصص</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReconciliations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        لا توجد سجلات
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredReconciliations.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{new Date(r.created_at).toLocaleString("ar-SA")}</TableCell>
                        <TableCell>{Number(r.expected_total).toFixed(2)}</TableCell>
                        <TableCell>{Number(r.actual_total).toFixed(2)}</TableCell>
                        <TableCell className={Math.abs(Number(r.difference)) > 0.01 ? "text-rose-600 font-bold" : ""}>
                          {Number(r.difference).toFixed(2)}
                        </TableCell>
                        <TableCell>{r.sessions_count}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(r.status)} variant="outline">
                            {r.status === "ok" ? "متطابق" : r.status === "minor_drift" ? "فرق بسيط" : "تباين"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Log */}
        <TabsContent value="audit">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle>سجل التدقيق المالي ({filteredAudit.length} من {auditLog.length})</CardTitle>
              <div className="flex gap-2">
                <FinancialExportButton
                  title="Financial Audit Log"
                  filename="financial_audit"
                  headers={[
                    { key: "created_at", label: "التاريخ" },
                    { key: "action", label: "الإجراء" },
                    { key: "entity_type", label: "الجهة" },
                    { key: "entity_id", label: "المعرف" },
                    { key: "amount", label: "المبلغ" },
                    { key: "actor_role", label: "دور المنفذ" },
                    { key: "actor_id", label: "المنفذ" },
                    { key: "ip_address", label: "IP" },
                  ]}
                  rows={auditExportRows}
                />
                <Button onClick={clearFilters} size="sm" variant="ghost">
                  <X className="h-4 w-4 ml-2" />
                  مسح الفلاتر
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-5 gap-2">
                <div className="md:col-span-2 relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث في الإجراء، المعرف، الجهة..."
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    className="pr-9"
                  />
                </div>
                <Select value={auditAction} onValueChange={setAuditAction}>
                  <SelectTrigger><SelectValue placeholder="نوع الإجراء" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الإجراءات</SelectItem>
                    {uniqueActions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={auditEntity} onValueChange={setAuditEntity}>
                  <SelectTrigger><SelectValue placeholder="الجهة" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الجهات</SelectItem>
                    {uniqueEntities.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-1">
                  <Input type="date" value={auditFrom} onChange={(e) => setAuditFrom(e.target.value)} title="من" />
                  <Input type="date" value={auditTo} onChange={(e) => setAuditTo(e.target.value)} title="إلى" />
                </div>
              </div>

              <div className="rounded-md border max-h-[600px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>الإجراء</TableHead>
                      <TableHead>الجهة</TableHead>
                      <TableHead>المبلغ</TableHead>
                      <TableHead>المنفذ</TableHead>
                      <TableHead>المعرف</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAudit.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                          لا توجد سجلات مطابقة
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAudit.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-xs whitespace-nowrap">{new Date(a.created_at).toLocaleString("ar-SA")}</TableCell>
                          <TableCell><Badge variant="secondary">{a.action}</Badge></TableCell>
                          <TableCell className="text-xs">{a.entity_type}</TableCell>
                          <TableCell>{a.amount ? Number(a.amount).toFixed(2) : "-"}</TableCell>
                          <TableCell className="text-xs">{a.actor_role || "-"}</TableCell>
                          <TableCell className="text-xs font-mono truncate max-w-[150px]">{a.entity_id}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>

          </Card>
        </TabsContent>

        {/* Withdrawal History */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>تتبع تغييرات حالات السحب</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>من</TableHead>
                    <TableHead>إلى</TableHead>
                    <TableHead>الملاحظات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withdrawalHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                        لا يوجد سجل
                      </TableCell>
                    </TableRow>
                  ) : (
                    withdrawalHistory.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="text-xs">{new Date(h.created_at).toLocaleString("ar-SA")}</TableCell>
                        <TableCell><Badge variant="outline">{h.from_status || "—"}</Badge></TableCell>
                        <TableCell><Badge>{h.to_status}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{h.notes || "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
