import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Plus, Loader2, TrendingUp, Users, Pencil, Check, Clock, Lock, Unlock, ShieldCheck, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import DateFilter from "./DateFilter";
import ExportCSVButton from "./ExportCSVButton";

const formatDuration = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const STATUS_OPTIONS = [
  { value: "confirmed", label: "مؤكدة", variant: "default" as const },
  { value: "unconfirmed", label: "غير مؤكدة", variant: "destructive" as const },
  { value: "in_progress", label: "جارية", variant: "secondary" as const },
];

const EARNING_TYPES = [
  { value: "monthly_transfer", label: "تحويل من أرباح الشهر" },
  { value: "bonus", label: "مكافأة إضافية" },
] as const;

const getStatusInfo = (status: string) =>
  status === "paid"
    ? { value: "paid", label: "مدفوعة", variant: "outline" as const }
    : STATUS_OPTIONS.find(s => s.value === status)
      || (status === "pending"
        ? { value: "pending", label: "قيد المراجعة", variant: "secondary" as const }
        : STATUS_OPTIONS[0]);

export default function TeacherEarningsTab() {
  const { user } = useAuth();
  const [earnings, setEarnings] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [teacherHoursMap, setTeacherHoursMap] = useState<Map<string, {
    minutes: number;
    seconds: number;
    estimatedEarnings: number;
    remainingTransferable: number;
  }>>(new Map());
  const [teacherMonthSplit, setTeacherMonthSplit] = useState<{ online: number; inPerson: number; total: number } | null>(null);
  const [closedMonths, setClosedMonths] = useState<Set<string>>(new Set());
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResults, setReconcileResults] = useState<any[] | null>(null);

  // Form state
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("confirmed");
  const [earningType, setEarningType] = useState<"monthly_transfer" | "bonus">("monthly_transfer");

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("admin-teacher-earnings")
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_earnings" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (selectedTeacher && month) fetchTeacherHours(selectedTeacher, month);
  }, [selectedTeacher, month, editingId]);

  useEffect(() => {
    if (!selectedTeacher) {
      setAvailableBalance(null);
      setBalanceError(false);
      return;
    }

    let active = true;
    const loadBalance = async () => {
      setBalanceLoading(true);
      setBalanceError(false);
      const { data, error } = await supabase.rpc("get_teacher_earnings_breakdown", {
        _teacher_id: selectedTeacher,
      });
      if (!active) return;
      if (error) {
        console.error("[admin-teacher-earnings] failed to load withdrawable balance:", error);
        setAvailableBalance(null);
        setBalanceError(true);
      } else {
        setAvailableBalance(Number(data?.[0]?.available_balance) || 0);
      }
      setBalanceLoading(false);
    };

    void loadBalance();
    const channel = supabase
      .channel(`admin-teacher-balance-${selectedTeacher}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "teacher_earnings",
        filter: `teacher_id=eq.${selectedTeacher}`,
      }, () => { void loadBalance(); })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "withdrawal_requests",
        filter: `teacher_id=eq.${selectedTeacher}`,
      }, () => { void loadBalance(); })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "teacher_payments",
        filter: `teacher_id=eq.${selectedTeacher}`,
      }, () => { void loadBalance(); })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [selectedTeacher]);

  const fetchTeacherHours = async (teacherId: string, monthStr: string) => {
    setTeacherMonthSplit(null);
    const [capacityResult, splitResult] = await Promise.all([
      supabase.rpc("get_teacher_monthly_transfer_capacity", {
        _teacher_id: teacherId,
        _month: monthStr,
        _exclude_earning_id: editingId,
      }),
      supabase.rpc("get_teacher_month_earnings_split" as any, {
        _teacher_id: teacherId,
        _month: monthStr,
      }),
    ]);
    const { data: capacityData, error: capacityError } = capacityResult;
    if (capacityError) {
      setTeacherHoursMap(prev => {
        const next = new Map(prev);
        next.delete(`${teacherId}_${monthStr}`);
        return next;
      });
      toast.error("تعذر حساب أرباح الحصص المتبقية للتحويل");
      return;
    }
    if (splitResult.error) {
      setTeacherMonthSplit(null);
      toast.error("تعذر تحميل تفصيل أرباح الأونلاين والحضوري");
    } else {
      const split = (splitResult.data?.[0] as any) || {};
      const online = Number(split.online_earnings) || 0;
      const inPerson = Number(split.in_person_earnings) || 0;
      setTeacherMonthSplit({ online, inPerson, total: online + inPerson });
    }

    const capacity = capacityData?.[0];
    const estimatedEarnings = Number(capacity?.session_earnings) || 0;
    const minutes = Number(capacity?.completed_minutes) || 0;
    const seconds = minutes * 60;
    const remainingTransferable = Number(capacity?.remaining) || 0;
    setTeacherHoursMap(prev => {
      const next = new Map(prev);
      next.set(`${teacherId}_${monthStr}`, { minutes, seconds, estimatedEarnings, remainingTransferable });
      return next;
    });
  };

  const getComputedHours = () => {
    const key = `${selectedTeacher}_${month}`;
    const data = teacherHoursMap.get(key) || { minutes: 0, seconds: 0, estimatedEarnings: 0, remainingTransferable: 0 };
    return { minutes: data.minutes, seconds: data.seconds, estimatedEarnings: data.estimatedEarnings, hours: Math.round((data.minutes / 60) * 100) / 100 };
  };

  const fetchData = async () => {
    // Fetch closed months
    const { data: fmData } = await supabase
      .from("financial_months" as any)
      .select("month, status");
    setClosedMonths(new Set((fmData as any[] ?? []).filter((f: any) => f.status === "closed").map((f: any) => f.month)));

    const { data: tps } = await supabase
      .from("teacher_profiles")
      .select("user_id, total_sessions")
      .eq("is_approved", true);

    if (tps && tps.length > 0) {
      const uids = tps.map(t => t.user_id);
      const [profilesRes, balancesRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name").in("user_id", uids),
        supabase.rpc("admin_list_teacher_withdrawable_balances" as any),
      ]);
      const nameMap = new Map((profilesRes.data ?? []).map(p => [p.user_id, p.full_name]));
      const balanceMap = new Map((balancesRes.data ?? []).map((row: any) => [row.user_id, Number(row.available_balance) || 0]));
      setTeachers(tps.map(t => ({
        ...t,
        balance: balancesRes.error ? null : balanceMap.get(t.user_id) ?? 0,
        full_name: nameMap.get(t.user_id) || "معلم",
      })));
    }

    const { data: earningsData } = await supabase
      .from("teacher_earnings" as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (earningsData && (earningsData as any[]).length > 0) {
      const teacherIds = [...new Set((earningsData as any[]).map((e: any) => e.teacher_id))];
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", teacherIds);
      const nameMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));
      setEarnings((earningsData as any[]).map((e: any) => ({ ...e, teacher_name: nameMap.get(e.teacher_id) || "معلم" })));
    } else {
      setEarnings([]);
    }
  };

  const toggleMonthStatus = async (monthStr: string) => {
    const isClosed = closedMonths.has(monthStr);
    setLoading(true);
    try {
      if (isClosed) {
        await supabase.from("financial_months" as any).update({ status: "open", closed_at: null, closed_by: null } as any).eq("month", monthStr);
        toast.success(`تم فتح شهر ${monthStr}`);
      } else {
        // Upsert
        const { data: existing } = await supabase.from("financial_months" as any).select("id").eq("month", monthStr).maybeSingle();
        if (existing) {
          await supabase.from("financial_months" as any).update({ status: "closed", closed_at: new Date().toISOString(), closed_by: user?.id } as any).eq("month", monthStr);
        } else {
          await supabase.from("financial_months" as any).insert({ month: monthStr, status: "closed", closed_at: new Date().toISOString(), closed_by: user?.id } as any);
        }
        toast.success(`تم إقفال شهر ${monthStr}`);
      }
      await supabase.from("system_logs").insert({
        level: "info", source: "financial_months",
        message: `${isClosed ? "فتح" : "إقفال"} شهر ${monthStr}`,
        user_id: user?.id, metadata: { month: monthStr, action: isClosed ? "open" : "close" },
      });
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setLoading(false);
    }
  };

  const runReconciliation = async () => {
    setReconciling(true);
    try {
      const results: any[] = [];
      const latestMonthlyEarnings = new Map<string, any>();
      for (const earning of earnings) {
        if ((earning.earning_type || "monthly_transfer") !== "monthly_transfer") continue;
        const key = `${earning.teacher_id}:${earning.month}`;
        const existing = latestMonthlyEarnings.get(key);
        if (!existing || new Date(earning.created_at) > new Date(existing.created_at)) {
          latestMonthlyEarnings.set(key, earning);
        }
      }
      for (const e of latestMonthlyEarnings.values()) {
        if (!e.minutes_snapshot && e.minutes_snapshot !== 0) continue;
        // Get actual stats
        const [year, m] = (e.month as string).split("-");
        const startDate = `${year}-${m}-01`;
        const endMonth = parseInt(m) === 12 ? 1 : parseInt(m) + 1;
        const endYear = parseInt(m) === 12 ? parseInt(year) + 1 : parseInt(year);
        const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

        const { data } = await supabase
          .from("teacher_daily_stats")
          .select("total_minutes")
          .eq("teacher_id", e.teacher_id)
          .gte("date", startDate)
          .lt("date", endDate);

        const actualMinutes = (data ?? []).reduce((sum: number, d: any) => sum + (d.total_minutes || 0), 0);
        const snapshotMinutes = Number(e.minutes_snapshot) || 0;
        const match = actualMinutes === snapshotMinutes;

        results.push({
          invoice_id: e.invoice_id || e.id.slice(0, 8),
          teacher_name: e.teacher_name,
          month: e.month,
          snapshot: snapshotMinutes,
          actual: actualMinutes,
          match,
        });
      }

      setReconcileResults(results);

      // Log reconciliation
      const mismatches = results.filter(r => !r.match).length;
      await supabase.from("system_logs").insert({
        level: mismatches > 0 ? "warn" : "info",
        source: "reconciliation",
        message: `تدقيق مالي: ${results.length} سجل - ${mismatches} تعارض`,
        user_id: user?.id,
        metadata: { total: results.length, mismatches, details: results.filter(r => !r.match) },
      });

      if (mismatches > 0) {
        toast.warning(`تم العثور على ${mismatches} تعارض من أصل ${results.length} سجل`);
      } else {
        toast.success(`جميع السجلات (${results.length}) متطابقة ✓`);
      }
    } catch (e: any) {
      toast.error("حدث خطأ في التدقيق");
    } finally {
      setReconciling(false);
    }
  };

  const resetForm = () => {
    setSelectedTeacher("");
    setAmount("");
    setNotes("");
    setStatus("confirmed");
    setEarningType("monthly_transfer");
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (e: any) => {
    if (e.rollover_source_month) {
      toast.error("لا يمكن تعديل رصيد تم ترحيله تلقائياً");
      return;
    }
    if (e.status === "paid") {
      toast.error("لا يمكن تعديل أرباح تم صرفها");
      return;
    }
    if (e.earning_type === "deduction") {
      toast.error("يمكن تعديل الخصم من قسم المكافآت والخصومات");
      return;
    }
    if (closedMonths.has(e.month)) {
      toast.error("هذا الشهر مقفل ولا يمكن التعديل");
      return;
    }
    setEditingId(e.id);
    setSelectedTeacher(e.teacher_id);
    setAmount(String(e.amount));
    setMonth(e.month);
    setNotes(e.notes || "");
    setStatus(e.status || "confirmed");
    setEarningType(e.earning_type === "bonus" ? "bonus" : "monthly_transfer");
    setShowForm(true);
  };

  const saveEarning = async () => {
    if (!selectedTeacher || !amount || !month) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    if (closedMonths.has(month)) {
      toast.error("هذا الشهر مقفل ولا يمكن إضافة أرباح");
      return;
    }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("المبلغ غير صحيح");
      return;
    }

    const { hours, minutes } = getComputedHours();
    const teacherData = teachers.find(t => t.user_id === selectedTeacher);
    const teacherMonthStats = teacherHoursMap.get(`${selectedTeacher}_${month}`);
    if (earningType === "monthly_transfer" && status === "confirmed") {
      if (!teacherMonthStats) {
        toast.error("انتظر اكتمال حساب أرباح الحصص قبل تسجيل التحويل");
        return;
      }
      if (amountNum > teacherMonthStats.remainingTransferable + 0.01) {
        toast.error(`المبلغ يتجاوز أرباح الحصص المتبقية للتحويل (${teacherMonthStats.remainingTransferable.toFixed(2)} ر.س)`);
        return;
      }
    }

    setLoading(true);
    try {
      if (editingId) {
        const oldEarning = earnings.find(e => e.id === editingId);
        if (oldEarning?.status === "paid") {
          toast.error("لا يمكن تعديل أرباح تم دفعها");
          setLoading(false);
          return;
        }

        const { error } = await supabase
          .from("teacher_earnings" as any)
          .update({ amount: amountNum, month, notes: notes || null, status, earning_type: earningType, hours, minutes_snapshot: minutes, total_sessions_snapshot: teacherData?.total_sessions || 0 } as any)
          .eq("id", editingId);
        if (error) throw error;

        await supabase.from("system_logs").insert({
          level: "info", source: "admin_earnings",
          message: `تعديل أرباح ID: ${editingId} - النوع: ${earningType} - المبلغ: ${amountNum} ر.س - الساعات: ${hours}`,
          user_id: user?.id, metadata: { earning_id: editingId, amount: amountNum, hours, status, month, earning_type: earningType },
        });

        toast.success("تم تعديل الأرباح بنجاح!");
      } else {
        const { error } = await supabase
          .from("teacher_earnings" as any)
          .insert({ teacher_id: selectedTeacher, amount: amountNum, month, notes: notes || null, added_by_admin: user?.id, status, earning_type: earningType, hours, minutes_snapshot: minutes, total_sessions_snapshot: teacherData?.total_sessions || 0 } as any);
        if (error) throw error;

        const earningTypeLabel = EARNING_TYPES.find(type => type.value === earningType)?.label || "أرباح يدوية";
        await supabase.from("notifications").insert({
          user_id: selectedTeacher,
          title: status !== "confirmed"
            ? "تم تسجيل أرباح بانتظار التأكيد"
            : earningType === "bonus"
              ? "تمت إضافة مكافأة جديدة 💰"
              : "تم تحويل أرباح الشهر إلى رصيد السحب 💰",
          body: `${status === "confirmed" ? "تم إضافة" : "تم تسجيل"} ${earningTypeLabel} بمبلغ ${amountNum.toLocaleString()} ر.س عن شهر ${month} (${computedHours.minutes} دقيقة عمل)`,
          type: "payment",
        });

        await supabase.from("system_logs").insert({
          level: "info", source: "admin_earnings",
          message: `إضافة ${earningTypeLabel} ${amountNum} ر.س للمعلم ${selectedTeacher} عن شهر ${month} - ${hours} ساعة`,
          user_id: user?.id, metadata: { teacher_id: selectedTeacher, amount: amountNum, hours, month, status, earning_type: earningType },
        });

        toast.success("تم إضافة الأرباح بنجاح!");
      }

      resetForm();
      await fetchData();
    } catch (e: any) {
      const message = e.message?.includes("Monthly transfer exceeds")
        ? "المبلغ يتجاوز أرباح الحصص المتبقية للتحويل لهذا الشهر"
        : e.message || "حدث خطأ";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = earnings.filter(e => {
    const created = new Date(e.created_at);
    if (dateFrom && created < new Date(dateFrom)) return false;
    if (dateTo) { const end = new Date(dateTo); end.setHours(23, 59, 59, 999); if (created > end) return false; }
    return true;
  });

  const totalAdded = filtered.reduce((sum, e) => sum + Number(e.amount), 0);
  const computedHours = getComputedHours();
  const isMonthClosed = closedMonths.has(month);

  // Unique months from earnings for month management
  const uniqueMonths = [...new Set(earnings.map(e => e.month))].sort().reverse();

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-secondary" />
              <span className="text-xs text-muted-foreground">إجمالي الأرباح المضافة</span>
            </div>
            <p className="text-xl font-black text-foreground">{totalAdded.toLocaleString()} ر.س</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">عدد المعلمين</span>
            </div>
            <p className="text-xl font-black text-foreground">{teachers.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">عدد العمليات</span>
            </div>
            <p className="text-xl font-black text-foreground">{filtered.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Month Management & Reconciliation */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            إدارة الأشهر المالية والتدقيق
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs" onClick={runReconciliation} disabled={reconciling}>
              {reconciling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              تدقيق مالي (Reconciliation)
            </Button>
          </div>

          {/* Month status list */}
          {uniqueMonths.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {uniqueMonths.map(m => {
                const isClosed = closedMonths.has(m);
                return (
                  <div key={m} className={`flex items-center justify-between p-2.5 rounded-xl border ${isClosed ? "bg-destructive/5 border-destructive/20" : "bg-muted/30 border-border"}`}>
                    <div className="flex items-center gap-2">
                      {isClosed ? <Lock className="h-3.5 w-3.5 text-destructive" /> : <Unlock className="h-3.5 w-3.5 text-green-600" />}
                      <span className="text-xs font-bold text-foreground">{m}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => toggleMonthStatus(m)} disabled={loading}>
                      {isClosed ? "فتح" : "إقفال"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Reconciliation Results */}
          {reconcileResults && (
            <div className="space-y-2">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                نتائج التدقيق
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-right pb-2 font-medium">الفاتورة</th>
                      <th className="text-right pb-2 font-medium">المعلم</th>
                      <th className="text-right pb-2 font-medium">الشهر</th>
                      <th className="text-right pb-2 font-medium">دقائق (لقطة)</th>
                      <th className="text-right pb-2 font-medium">دقائق (فعلي)</th>
                      <th className="text-right pb-2 font-medium">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {reconcileResults.map((r, i) => (
                      <tr key={i} className={r.match ? "" : "bg-destructive/5"}>
                        <td className="py-2 font-mono text-foreground">{r.invoice_id}</td>
                        <td className="py-2 text-foreground">{r.teacher_name}</td>
                        <td className="py-2">{r.month}</td>
                        <td className="py-2">{r.snapshot}</td>
                        <td className="py-2">{r.actual}</td>
                        <td className="py-2">
                          {r.match ? (
                            <Badge variant="default" className="text-[10px] gap-1"><Check className="h-2.5 w-2.5" /> متطابق</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px] gap-1"><AlertTriangle className="h-2.5 w-2.5" /> تعارض</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => setReconcileResults(null)}>إغلاق النتائج</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-secondary" />
              إدارة أرباح المعلمين ({filtered.length})
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" className="rounded-xl gap-1.5 text-xs" onClick={() => { resetForm(); setShowForm(!showForm); }}>
                <Plus className="h-3.5 w-3.5" />
                إضافة أرباح
              </Button>
              <DateFilter dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
              <ExportCSVButton
                data={filtered.map(e => ({ invoice: e.invoice_id || "", teacher: e.teacher_name, type: e.earning_type === "bonus" ? "مكافأة إضافية" : e.earning_type === "deduction" ? "خصم" : "تحويل شهري", amount: e.amount, hours: e.hours || 0, month: e.month, status: getStatusInfo(e.status).label, notes: e.notes || "", date: new Date(e.created_at).toLocaleDateString("ar-SA") }))}
                headers={[{ key: "invoice", label: "رقم الفاتورة" }, { key: "teacher", label: "المعلم" }, { key: "type", label: "نوع الإضافة" }, { key: "amount", label: "المبلغ" }, { key: "hours", label: "الساعات" }, { key: "month", label: "الشهر" }, { key: "status", label: "الحالة" }, { key: "notes", label: "ملاحظات" }, { key: "date", label: "تاريخ الإضافة" }]}
                filename="أرباح_المعلمين"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add/Edit Form */}
          {showForm && (
            <div className="p-4 rounded-xl bg-accent/30 border border-border space-y-3">
              <h4 className="font-bold text-sm">{editingId ? "تعديل الأرباح" : "إضافة أرباح يدوية"}</h4>

              {isMonthClosed && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 flex items-center gap-2">
                  <Lock className="h-4 w-4 text-destructive" />
                  <span className="text-xs text-destructive font-bold">هذا الشهر مقفل - لا يمكن إضافة أو تعديل الأرباح</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">المعلم *</label>
                  <Select value={selectedTeacher} onValueChange={setSelectedTeacher} disabled={!!editingId}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر المعلم" /></SelectTrigger>
                    <SelectContent>
                      {teachers.map(t => (
                        <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">الشهر *</label>
                  <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">نوع الإضافة *</label>
                  <Select value={earningType} onValueChange={value => setEarningType(value as "monthly_transfer" | "bonus")}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EARNING_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedTeacher && month && (
                  <div className="md:col-span-2 p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-primary" />
                      <span className="text-sm font-bold text-foreground">إحصائيات الجلسات المكتملة</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">الوقت الفعلي للجلسات</p>
                        <p className="text-xl font-black text-primary font-mono tracking-wider">
                          {formatDuration(computedHours.seconds)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{computedHours.minutes} دقيقة ({computedHours.hours} ساعة)</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">تقدير أرباح الجلسات</p>
                        <p className="text-xl font-black text-emerald-600">
                          {computedHours.estimatedEarnings.toFixed(2)} ر.س
                        </p>
                        <p className="text-[10px] text-muted-foreground">حسب دقائق الجلسات المسجلة</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">المتبقي للتحويل من أرباح الشهر</p>
                        <p data-testid="text-monthly-transfer-remaining" className="text-xl font-black text-emerald-600">
                          {(teacherHoursMap.get(`${selectedTeacher}_${month}`)?.remainingTransferable || 0).toFixed(2)} ر.س
                        </p>
                        <p className="text-[10px] text-muted-foreground">بعد خصم التحويلات الشهرية السابقة</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">إجمالي الرصيد المتاح للسحب</p>
                        <p data-testid="text-total-withdrawable-balance" className="text-xl font-black text-primary">
                          {balanceLoading
                            ? <Loader2 className="inline h-4 w-4 animate-spin" />
                            : balanceError
                              ? "تعذر التحميل"
                              : `${(availableBalance ?? 0).toFixed(2)} ر.س`}
                        </p>
                        <p className="text-[10px] text-muted-foreground">يشمل التحويلات والمكافآت بعد حجز طلبات السحب</p>
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                      <p className="mb-2 text-xs font-bold text-foreground">أرباح الشهر حسب نوع الحصة</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="rounded-lg bg-primary/5 p-2.5">
                          <p className="text-[10px] text-muted-foreground">أونلاين</p>
                          <p data-testid="admin-online-monthly-earnings" className="mt-1 font-black text-primary">
                            {teacherMonthSplit ? `${teacherMonthSplit.online.toFixed(2)} ر.س` : "—"}
                          </p>
                        </div>
                        <div className="rounded-lg bg-secondary/10 p-2.5">
                          <p className="text-[10px] text-muted-foreground">حضوري</p>
                          <p data-testid="admin-in-person-monthly-earnings" className="mt-1 font-black text-secondary">
                            {teacherMonthSplit ? `${teacherMonthSplit.inPerson.toFixed(2)} ر.س` : "—"}
                          </p>
                        </div>
                        <div className="rounded-lg bg-emerald-50 p-2.5">
                          <p className="text-[10px] text-muted-foreground">الإجمالي</p>
                          <p data-testid="admin-total-monthly-earnings" className="mt-1 font-black text-emerald-700">
                            {teacherMonthSplit ? `${teacherMonthSplit.total.toFixed(2)} ر.س` : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                    {earningType === "bonus" && (
                      <p className="text-xs text-muted-foreground">
                        المكافأة تضاف إلى رصيد السحب ولا تخصم من أرباح الحصص الشهرية.
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">* الدقائق معروضة حسب حجوزات الشهر، ومبلغ الشهر محسوب من صافي الجلسات المكتملة.</p>
                  </div>
                )}

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">المبلغ (ر.س) *</label>
                  <Input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} className="rounded-xl" min="0" step="0.01" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">الحالة *</label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.filter(s => s.value !== "paid").map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">ملاحظات</label>
                  <Textarea placeholder="ملاحظات اختيارية..." value={notes} onChange={e => setNotes(e.target.value)} className="rounded-xl resize-none min-h-[40px]" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="rounded-xl gap-1.5" onClick={saveEarning} disabled={loading || isMonthClosed}>
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {editingId ? "حفظ التعديل" : "إضافة"}
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl" onClick={resetForm}>إلغاء</Button>
              </div>
            </div>
          )}

          {/* Earnings List */}
          {filtered.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">لا توجد أرباح مسجلة</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-right pb-3 font-medium">الفاتورة</th>
                    <th className="text-right pb-3 font-medium">المعلم</th>
                    <th className="text-right pb-3 font-medium">الساعات</th>
                    <th className="text-right pb-3 font-medium">المبلغ</th>
                    <th className="text-right pb-3 font-medium">الشهر</th>
                    <th className="text-right pb-3 font-medium">نوع الإضافة</th>
                    <th className="text-right pb-3 font-medium">ملاحظات</th>
                    <th className="text-right pb-3 font-medium">الحالة</th>
                    <th className="text-right pb-3 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((e: any) => {
                    const si = getStatusInfo(e.status);
                    const monthLocked = closedMonths.has(e.month);
                    return (
                      <tr key={e.id} className={`hover:bg-muted/30 ${monthLocked ? "opacity-70" : ""}`}>
                        <td className="py-3 font-mono text-xs text-primary">{e.invoice_id || "—"}</td>
                        <td className="py-3 font-medium text-foreground">{e.teacher_name}</td>
                        <td className="py-3 text-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {e.hours ? `${Number(e.hours).toFixed(1)} ساعة` : "—"}
                          </span>
                        </td>
                        <td className="py-3 text-foreground">{Number(e.amount).toLocaleString()} ر.س</td>
                        <td className="py-3">
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs">{e.month}</Badge>
                            {monthLocked && <Lock className="h-3 w-3 text-destructive" />}
                          </div>
                        </td>
                        <td className="py-3 text-xs">
                          {e.rollover_source_month
                            ? `ترحيل تلقائي من ${e.rollover_source_month}`
                            : e.earning_type === "bonus"
                              ? "مكافأة إضافية"
                              : e.earning_type === "deduction"
                                ? "خصم"
                                : "تحويل من أرباح الشهر"}
                        </td>
                        <td className="py-3 text-muted-foreground text-xs">{e.notes || "—"}</td>
                        <td className="py-3"><Badge variant={si.variant} className="text-xs">{si.label}</Badge></td>
                        <td className="py-3">
                          {e.status === "paid" ? (
                            <Badge variant="default" className="text-[10px]">مدفوع ✓</Badge>
                          ) : monthLocked ? (
                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(e)}>
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Teachers by Balance */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-secondary" />
            أعلى المعلمين بالمتاح للسحب
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            من إضافات الإدارة المؤكدة بعد التخصيصات والسحوبات.
          </p>
        </CardHeader>
        <CardContent>
          {teachers.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground">لا يوجد معلمين</p>
          ) : (
            <div className="space-y-2">
              {[...teachers]
                .sort((a, b) => (Number(b.balance) || 0) - (Number(a.balance) || 0))
                .slice(0, 10)
                .map((t, i) => (
                  <div key={t.user_id} className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{i + 1}</span>
                      <div>
                        <p className="font-bold text-sm text-foreground">{t.full_name}</p>
                        <p className="text-xs text-muted-foreground">{t.total_sessions || 0} حصة</p>
                      </div>
                    </div>
                    <p className="font-black text-sm text-foreground">
                      {t.balance === null ? "—" : `${Number(t.balance || 0).toLocaleString()} ر.س`}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
