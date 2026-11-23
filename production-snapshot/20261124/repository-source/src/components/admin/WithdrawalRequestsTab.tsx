import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CheckCircle, XCircle, DollarSign, CreditCard, Plus, Minus, Gift, Loader2,
  RefreshCw, Search, Wallet, Clock, Ban, TrendingUp, ChevronDown, ChevronUp, FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import DateFilter from "./DateFilter";
import ExportCSVButton from "./ExportCSVButton";
import { AdminKPIBar } from "./AdminKPIBar";
import { AdminTable, AdminTableColumn } from "./AdminTable";
import { cn } from "@/lib/utils";

type ReqStatus = "all" | "pending" | "paid" | "rejected";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: "معلق", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  paid: { label: "مدفوع", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "مرفوض", cls: "bg-red-50 text-red-600 border-red-200" },
};

export default function WithdrawalRequestsTab() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReqStatus>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Manual adjustment
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustTeacher, setAdjustTeacher] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustType, setAdjustType] = useState<"bonus" | "deduction">("bonus");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);

  useEffect(() => { fetchData(); fetchTeachers(); }, []);

  const fetchTeachers = async () => {
    const { data: tps } = await supabase.from("teacher_profiles").select("user_id").eq("is_approved", true);
    if (tps && tps.length > 0) {
      const uids = tps.map((t: any) => t.user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", uids);
      setTeachers((profiles ?? []).map((p: any) => ({ user_id: p.user_id, full_name: p.full_name })));
    }
  };

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("withdrawal_requests" as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (data && (data as any[]).length > 0) {
      const teacherIds = [...new Set((data as any[]).map((r: any) => r.teacher_id))];
      const [{ data: profiles }, { data: teacherProfiles }] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name").in("user_id", teacherIds),
        supabase.from("teacher_profiles").select("user_id, bank_name, iban, account_holder_name").in("user_id", teacherIds),
      ]);
      const nameMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p.full_name]));
      const bankMap = new Map((teacherProfiles ?? []).map((p: any) => [p.user_id, { bank_name: p.bank_name, iban: p.iban, account_holder_name: p.account_holder_name }]));
      setRequests((data as any[]).map((r: any) => ({ ...r, teacher_name: nameMap.get(r.teacher_id) || "معلم", bank_info: bankMap.get(r.teacher_id) || null })));
    } else {
      setRequests([]);
    }
    setLoading(false);
  };

  const updateStatus = async (id: string, status: string, teacherId: string) => {
    setProcessingId(id);
    try {
      await supabase.from("withdrawal_requests" as any).update({ status, admin_notes: adminNotes[id] || null }).eq("id", id);
      if (status === "paid") {
        const req = requests.find((r: any) => r.id === id);
        if (req) {
          await supabase.from("notifications").insert({ user_id: teacherId, title: "✅ تمت الموافقة على طلب السحب", body: `تم تحويل مبلغ ${req.amount} ريال إلى حسابك البنكي`, type: "withdrawal" } as any);
        }
      } else if (status === "rejected") {
        await supabase.from("notifications").insert({ user_id: teacherId, title: "❌ تم رفض طلب السحب", body: adminNotes[id] ? `السبب: ${adminNotes[id]}` : "تم رفض طلب السحب", type: "withdrawal" } as any);
      }
      toast.success(status === "paid" ? "تم تأكيد الدفع" : "تم رفض الطلب");
      setExpandedId(null);
      await fetchData();
    } catch {
      toast.error("فشل تحديث الحالة");
    } finally {
      setProcessingId(null);
    }
  };

  const submitAdjustment = async () => {
    if (!adjustTeacher || !adjustAmount || !user) { toast.error("يرجى ملء جميع الحقول"); return; }
    const amountNum = parseFloat(adjustAmount);
    if (isNaN(amountNum) || amountNum <= 0) { toast.error("المبلغ غير صحيح"); return; }
    setAdjustLoading(true);
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const finalAmount = adjustType === "deduction" ? -amountNum : amountNum;
      const label = adjustType === "bonus" ? "مكافأة" : "خصم";
      const { data: existing } = await supabase.from("teacher_monthly_earnings" as any).select("id, total_earned").eq("teacher_id", adjustTeacher).eq("month", currentMonth).maybeSingle();
      if (existing) {
        await supabase.from("teacher_monthly_earnings" as any).update({ total_earned: (existing as any).total_earned + finalAmount, notes: adjustNotes || null }).eq("id", (existing as any).id);
      } else {
        await supabase.from("teacher_monthly_earnings" as any).insert({ teacher_id: adjustTeacher, month: currentMonth, total_earned: finalAmount, notes: adjustNotes || null });
      }
      await supabase.from("notifications").insert({ user_id: adjustTeacher, title: `💰 ${label} من الإدارة`, body: `${label} بمبلغ ${amountNum} ريال${adjustNotes ? ` — ${adjustNotes}` : ""}`, type: "earnings" } as any);
      toast.success(`تم تطبيق ${label} بنجاح`);
      setShowAdjustment(false);
      setAdjustTeacher(""); setAdjustAmount(""); setAdjustNotes("");
    } catch {
      toast.error("فشل في تطبيق التعديل");
    } finally {
      setAdjustLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return requests.filter((r: any) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (searchQuery && !(r.teacher_name || "").toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (dateFrom && new Date(r.created_at) < new Date(dateFrom)) return false;
      if (dateTo) { const end = new Date(dateTo); end.setHours(23, 59, 59, 999); if (new Date(r.created_at) > end) return false; }
      return true;
    });
  }, [requests, statusFilter, searchQuery, dateFrom, dateTo]);

  const kpis = useMemo(() => {
    const pending = requests.filter((r: any) => r.status === "pending");
    const paid = requests.filter((r: any) => r.status === "paid");
    return {
      total: requests.length,
      pending: pending.length,
      pendingAmount: pending.reduce((s: number, r: any) => s + Number(r.amount || 0), 0),
      paidAmount: paid.reduce((s: number, r: any) => s + Number(r.amount || 0), 0),
    };
  }, [requests]);

  const STATUS_FILTERS: { value: ReqStatus; label: string }[] = [
    { value: "all", label: "الكل" },
    { value: "pending", label: "معلق" },
    { value: "paid", label: "مدفوع" },
    { value: "rejected", label: "مرفوض" },
  ];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <AdminKPIBar
        kpis={[
          { label: "إجمالي الطلبات", value: kpis.total, icon: Wallet, accent: "bg-blue-50", iconClass: "text-blue-600" },
          { label: "طلبات معلقة", value: kpis.pending, icon: Clock, accent: "bg-amber-50", iconClass: "text-amber-600" },
          { label: "مبلغ انتظار الصرف", value: `${kpis.pendingAmount.toFixed(0)} ر.س`, icon: DollarSign, accent: "bg-rose-50", iconClass: "text-rose-600" },
          { label: "إجمالي المدفوع", value: `${kpis.paidAmount.toFixed(0)} ر.س`, icon: TrendingUp, accent: "bg-emerald-50", iconClass: "text-emerald-600" },
        ]}
      />

      {/* Main Card */}
      <Card className="border border-border/50 bg-card shadow-sm">
        <CardHeader className="px-5 pt-5 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold text-foreground">
              طلبات سحب الأرباح{" "}
              <span className="text-muted-foreground font-normal">({filtered.length})</span>
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="بحث باسم المعلم..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-9 h-8 text-sm w-44 bg-muted/30 border-border/60"
                />
              </div>
              <div className="flex items-center gap-1">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setStatusFilter(f.value)}
                    className={[
                      "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                      statusFilter === f.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted",
                    ].join(" ")}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <DateFilter dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
              <ExportCSVButton
                data={filtered.map((r: any) => ({
                  teacher: r.teacher_name,
                  amount: r.amount,
                  bank: r.bank_info?.bank_name || "—",
                  iban: r.bank_info?.iban || "—",
                  status: STATUS_LABELS[r.status]?.label || r.status,
                  date: new Date(r.created_at).toLocaleDateString("ar-SA"),
                  notes: r.admin_notes || "",
                }))}
                headers={[
                  { key: "teacher", label: "المعلم" },
                  { key: "amount", label: "المبلغ" },
                  { key: "bank", label: "البنك" },
                  { key: "iban", label: "IBAN" },
                  { key: "status", label: "الحالة" },
                  { key: "date", label: "التاريخ" },
                  { key: "notes", label: "ملاحظات الإدارة" },
                ]}
                filename="طلبات_السحب"
              />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchData}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 bg-muted/30 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <Wallet className="h-10 w-10 opacity-20" />
              <p className="text-sm">لا توجد طلبات مطابقة</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/50">
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-muted-foreground">المعلم</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-muted-foreground">المبلغ</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-muted-foreground">البنك / IBAN</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-muted-foreground">التاريخ</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-muted-foreground">الحالة</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any) => {
                    const isExpanded = expandedId === r.id;
                    const st = STATUS_LABELS[r.status] || { label: r.status, cls: "bg-muted text-foreground border-border" };
                    return (
                      <>
                        <tr
                          key={r.id}
                          className="border-b border-border/30 hover:bg-muted/15 transition-colors cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        >
                          <td className="px-4 py-3 font-medium text-foreground">{r.teacher_name}</td>
                          <td className="px-4 py-3 font-bold text-foreground">
                            {Number(r.amount).toFixed(2)} ر.س
                          </td>
                          <td className="px-4 py-3">
                            {r.bank_info?.bank_name ? (
                              <div>
                                <p className="text-xs font-medium text-foreground">{r.bank_info.bank_name}</p>
                                {r.bank_info.iban && (
                                  <p className="text-[10px] text-muted-foreground font-mono" dir="ltr">
                                    {r.bank_info.iban.replace(/(.{4})/g, "$1 ").trim()}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-destructive">بيانات بنكية ناقصة</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(r.created_at).toLocaleDateString("ar-SA")}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded border", st.cls)}>
                              {st.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-left" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5 justify-end">
                              {r.status === "pending" && (
                                <>
                                  <Button
                                    size="sm"
                                    className="h-7 px-2.5 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                                    onClick={() => updateStatus(r.id, "paid", r.teacher_id)}
                                    disabled={processingId === r.id}
                                  >
                                    {processingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                                    دفع
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-7 px-2.5 text-[11px] gap-1"
                                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                                    disabled={processingId === r.id}
                                  >
                                    <XCircle className="h-3 w-3" />
                                    رفض
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => setExpandedId(isExpanded ? null : r.id)}
                              >
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${r.id}-expanded`} className="border-b border-border/30 bg-muted/10">
                            <td colSpan={6} className="px-5 py-4">
                              <div className="space-y-3 max-w-xl">
                                {/* Bank details */}
                                <div className="bg-background rounded-lg border border-border/50 p-3 space-y-1.5">
                                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                    <CreditCard className="h-3.5 w-3.5" /> بيانات الحساب البنكي
                                  </p>
                                  {r.bank_info?.bank_name ? (
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      <div>
                                        <span className="text-muted-foreground">البنك: </span>
                                        <span className="font-medium">{r.bank_info.bank_name}</span>
                                      </div>
                                      {r.bank_info.account_holder_name && (
                                        <div>
                                          <span className="text-muted-foreground">صاحب الحساب: </span>
                                          <span className="font-medium">{r.bank_info.account_holder_name}</span>
                                        </div>
                                      )}
                                      {r.bank_info.iban && (
                                        <div className="col-span-2">
                                          <span className="text-muted-foreground">IBAN: </span>
                                          <span className="font-mono font-medium" dir="ltr">{r.bank_info.iban}</span>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-destructive">لم يُضف المعلم بيانات بنكية بعد</p>
                                  )}
                                </div>

                                {/* Attachment */}
                                {r.attachment_url && (
                                  <a href={r.attachment_url} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline bg-primary/8 rounded-md px-3 py-1.5">
                                    <FileText className="h-3.5 w-3.5" />
                                    {r.attachment_name || "عرض المرفق"}
                                  </a>
                                )}

                                {/* Admin notes + reject action */}
                                {r.status === "pending" && (
                                  <div className="space-y-2">
                                    <Textarea
                                      placeholder="ملاحظات الإدارة (اختياري عند الرفض)..."
                                      value={adminNotes[r.id] || ""}
                                      onChange={(e) => setAdminNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                                      className="min-h-[56px] resize-none text-sm"
                                    />
                                    <div className="flex gap-2">
                                      <Button size="sm" className="gap-1 text-xs flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => updateStatus(r.id, "paid", r.teacher_id)} disabled={processingId === r.id}>
                                        <CheckCircle className="h-3.5 w-3.5" /> تأكيد الدفع
                                      </Button>
                                      <Button size="sm" variant="destructive" className="gap-1 text-xs flex-1" onClick={() => updateStatus(r.id, "rejected", r.teacher_id)} disabled={processingId === r.id}>
                                        <XCircle className="h-3.5 w-3.5" /> رفض الطلب
                                      </Button>
                                    </div>
                                  </div>
                                )}
                                {r.admin_notes && (
                                  <p className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2.5 border border-border/40">
                                    <span className="font-medium text-foreground">ملاحظات الإدارة: </span>
                                    {r.admin_notes}
                                  </p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Adjustment */}
      <Card className="border border-border/50 bg-card shadow-sm">
        <CardHeader className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Gift className="h-4 w-4 text-muted-foreground" />
              تعديل يدوي على أرباح المعلم
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShowAdjustment(!showAdjustment)}>
              {showAdjustment ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {showAdjustment ? "إخفاء" : "إضافة تعديل"}
            </Button>
          </div>
        </CardHeader>
        {showAdjustment && (
          <CardContent className="px-5 pb-5">
            <div className="grid sm:grid-cols-2 gap-3 max-w-lg">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">المعلم</label>
                <Select value={adjustTeacher} onValueChange={setAdjustTeacher}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر معلماً..." /></SelectTrigger>
                  <SelectContent>
                    {teachers.map((t: any) => (
                      <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">نوع التعديل</label>
                <div className="flex gap-2">
                  <button onClick={() => setAdjustType("bonus")} className={cn("flex-1 h-9 rounded-lg text-xs font-medium border transition-colors", adjustType === "bonus" ? "bg-emerald-600 text-white border-emerald-600" : "border-border text-muted-foreground hover:border-emerald-400")}>
                    <Plus className="h-3.5 w-3.5 inline ml-1" /> مكافأة
                  </button>
                  <button onClick={() => setAdjustType("deduction")} className={cn("flex-1 h-9 rounded-lg text-xs font-medium border transition-colors", adjustType === "deduction" ? "bg-destructive text-white border-destructive" : "border-border text-muted-foreground hover:border-red-400")}>
                    <Minus className="h-3.5 w-3.5 inline ml-1" /> خصم
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">المبلغ (ر.س)</label>
                <Input type="number" placeholder="0.00" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">سبب التعديل (اختياري)</label>
                <Input placeholder="مثال: مكافأة على الأداء..." value={adjustNotes} onChange={(e) => setAdjustNotes(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="sm:col-span-2">
                <Button onClick={submitAdjustment} disabled={adjustLoading} className="h-9 text-sm gap-1.5">
                  {adjustLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  تطبيق التعديل
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
