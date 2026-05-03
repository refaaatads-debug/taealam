import { useEffect, useState } from "react";
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
import { Loader2, ShieldCheck, AlertTriangle, RefreshCw, Lock, FileText, TrendingUp } from "lucide-react";

interface FinancialSettings {
  id: string;
  vat_rate: number;
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
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    void loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, a, r, h] = await Promise.all([
        supabase.from("financial_settings" as any).select("*").maybeSingle(),
        supabase.from("financial_audit_log" as any).select("*").order("created_at", { ascending: false }).limit(50),
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

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList className="grid grid-cols-4 w-full">
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
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>سجل المطابقة المالية</CardTitle>
              <Button onClick={runReconciliation} disabled={running} size="sm">
                {running ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <TrendingUp className="h-4 w-4 ml-2" />}
                تشغيل مطابقة الآن
              </Button>
            </CardHeader>
            <CardContent>
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
                  {reconciliations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        لا توجد سجلات مطابقة بعد
                      </TableCell>
                    </TableRow>
                  ) : (
                    reconciliations.map((r) => (
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
            <CardHeader>
              <CardTitle>سجل التدقيق المالي ({auditLog.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الإجراء</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>المعرف</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLog.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        لا توجد سجلات
                      </TableCell>
                    </TableRow>
                  ) : (
                    auditLog.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs">{new Date(a.created_at).toLocaleString("ar-SA")}</TableCell>
                        <TableCell><Badge variant="secondary">{a.action}</Badge></TableCell>
                        <TableCell className="text-xs">{a.entity_type}</TableCell>
                        <TableCell>{a.amount ? Number(a.amount).toFixed(2) : "-"}</TableCell>
                        <TableCell className="text-xs font-mono truncate max-w-[150px]">{a.entity_id}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
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
