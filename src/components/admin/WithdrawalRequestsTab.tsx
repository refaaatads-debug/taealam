import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle, DollarSign, FileText, Download, ChevronDown, ChevronUp, CreditCard, Plus, Minus, Gift, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import DateFilter from "./DateFilter";
import ExportCSVButton from "./ExportCSVButton";
import StatusFilter from "./StatusFilter";

export default function WithdrawalRequestsTab() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Adjustment form
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
      const uids = tps.map(t => t.user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", uids);
      setTeachers((profiles ?? []).map(p => ({ user_id: p.user_id, full_name: p.full_name })));
    }
  };

  const fetchData = async () => {
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
      const nameMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));
      const bankMap = new Map((teacherProfiles ?? []).map((p: any) => [p.user_id, { bank_name: p.bank_name, iban: p.iban, account_holder_name: p.account_holder_name }]));
      setRequests((data as any[]).map((r: any) => ({ ...r, teacher_name: nameMap.get(r.teacher_id) || "معلم", bank_info: bankMap.get(r.teacher_id) || null })));
    } else {
      setRequests([]);
    }
  };

  const submitAdjustment = async () => {
    if (!adjustTeacher || !adjustAmount || !user) {
      toast.error("يرجى ملء جميع الحقول");
      return;
    }
    const amountNum = parseFloat(adjustAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("المبلغ غير صحيح");
      return;
    }

    setAdjustLoading(true);
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const finalAmount = adjustType === "deduction" ? -amountNum : amountNum;
      const label = adjustType === "bonus" ? "مكافأة" : "خصم";

      // Add as earning entry (negative for deductions)
      await supabase.from("teacher_earnings" as any).insert({
        teacher_id: adjustTeacher,
        amount: finalAmount,
        month: currentMonth,
        notes: `${label}: ${adjustNotes || "بدون ملاحظات"}`,
        added_by_admin: user.id,
        status: "confirmed",
        hours: 0,
      } as any);

      // Update teacher balance
      const { data: tp } = await supabase.from("teacher_profiles").select("balance").eq("user_id", adjustTeacher).single();
      const newBalance = Math.max(0, (Number(tp?.balance) || 0) + finalAmount);
      await supabase.from("teacher_profiles").update({ balance: newBalance } as any).eq("user_id", adjustTeacher);

      // Notify teacher
      const teacherName = teachers.find(t => t.user_id === adjustTeacher)?.full_name || "معلم";
      await supabase.from("notifications").insert({
        user_id: adjustTeacher,
        title: adjustType === "bonus" ? "🎁 تمت إضافة مكافأة" : "📋 تم تطبيق خصم",
        body: `${label} بمبلغ ${amountNum.toLocaleString()} ر.س${adjustNotes ? ` - ${adjustNotes}` : ""}`,
        type: "payment",
      });

      toast.success(`تم ${adjustType === "bonus" ? "إضافة المكافأة" : "تطبيق الخصم"} بنجاح`);
      setShowAdjustment(false);
      setAdjustTeacher("");
      setAdjustAmount("");
      setAdjustNotes("");
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setAdjustLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string, teacherId: string) => {
    const notes = adminNotes[id] || null;
    await supabase.from("withdrawal_requests" as any).update({ status, admin_notes: notes } as any).eq("id", id);

    if (status === "paid") {
      const req = requests.find(r => r.id === id);
      if (req) {
        await supabase.from("teacher_payments" as any).insert({
          teacher_id: teacherId,
          amount: req.amount,
          withdrawal_request_id: id,
          notes: notes || "دفع عبر تحويل بنكي",
        } as any);

        const [sessionsRes, violationsRes, warningsRes] = await Promise.all([
          supabase.from("bookings").select("scheduled_at, duration_minutes, price, status").eq("teacher_id", teacherId).eq("status", "completed"),
          (supabase as any).from("violations").select("violation_type, created_at, is_false_positive").eq("user_id", teacherId),
          supabase.from("user_warnings").select("warning_type, warning_count, is_banned").eq("user_id", teacherId),
        ]);

        const sessions = sessionsRes.data ?? [];
        const totalHours = sessions.reduce((sum: number, s: any) => sum + (Number(s.duration_minutes) || 0), 0);
        const totalHoursFormatted = Math.floor(totalHours / 60);
        const totalMinutes = totalHours % 60;

        const violations = (violationsRes.data ?? []) as any[];
        const confirmedViolations = violations.filter((v: any) => !v.is_false_positive);
        const warnings = (warningsRes.data ?? []) as any[];
        const totalWarnings = warnings.reduce((sum: number, w: any) => sum + (w.warning_count || 0), 0);
        const isBanned = warnings.some((w: any) => w.is_banned);

        const violationSummary = confirmedViolations.length > 0
          ? `\n📛 المخالفات المؤكدة: ${confirmedViolations.length}\n` +
            confirmedViolations.slice(0, 5).map((v: any) =>
              `  • ${v.violation_type === "contact_sharing" ? "مشاركة معلومات اتصال" : v.violation_type === "platform_mention" ? "ذكر منصة خارجية" : "مخالفة"} - ${new Date(v.created_at).toLocaleDateString("ar-SA")}`
            ).join("\n") +
            (confirmedViolations.length > 5 ? `\n  ... و${confirmedViolations.length - 5} مخالفات أخرى` : "")
          : "\n✅ لا توجد مخالفات مسجلة";

        const warningLine = totalWarnings > 0
          ? `\n⚠️ التحذيرات: ${totalWarnings}/3${isBanned ? " (محظور حالياً)" : ""}`
          : "";

        const reportBody =
          `📊 تقرير الدفع:\n` +
          `━━━━━━━━━━━━━━━\n` +
          `💰 المبلغ المحوّل: ${Number(req.amount).toLocaleString()} ر.س\n` +
          `📚 إجمالي الحصص المكتملة: ${sessions.length} حصة\n` +
          `⏱️ إجمالي ساعات التدريس: ${totalHoursFormatted} ساعة${totalMinutes > 0 ? ` و${totalMinutes} دقيقة` : ""}\n` +
          violationSummary +
          warningLine +
          `\n━━━━━━━━━━━━━━━\n` +
          `شكراً لجهودك في التدريس! 🎓`;

        await supabase.from("notifications").insert({
          user_id: teacherId,
          title: "تم تحويل أرباحك! 💰",
          body: reportBody,
          type: "payment",
        });
      }
    } else {
      await supabase.from("notifications").insert({
        user_id: teacherId,
        title: status === "rejected" ? "تم رفض طلب السحب ❌" : "تم تحديث طلب السحب",
        body: status === "rejected"
          ? `تم رفض طلب سحب الأرباح.${notes ? ` السبب: ${notes}` : " تواصل مع الإدارة للمزيد"}`
          : `تم تحديث حالة طلب السحب إلى: ${statusMap[status]?.label || status}`,
        type: "withdrawal",
      });
    }

    toast.success(status === "paid" ? "تم الدفع وإرسال التقرير للمعلم" : "تم تحديث الطلب");
    fetchData();
  };

  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "قيد المراجعة", variant: "outline" },
    approved: { label: "تمت الموافقة", variant: "secondary" },
    paid: { label: "تم الدفع", variant: "default" },
    rejected: { label: "مرفوض", variant: "destructive" },
  };

  const filtered = requests.filter(r => {
    const created = new Date(r.created_at);
    if (dateFrom && created < new Date(dateFrom)) return false;
    if (dateTo) { const end = new Date(dateTo); end.setHours(23,59,59,999); if (created > end) return false; }
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Admin Adjustments (Bonuses/Deductions) */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Gift className="h-5 w-5 text-secondary" />
              مكافآت وخصومات
            </CardTitle>
            <Button size="sm" className="rounded-xl gap-1.5 text-xs" onClick={() => setShowAdjustment(!showAdjustment)}>
              <Plus className="h-3.5 w-3.5" />
              إضافة تعديل
            </Button>
          </div>
        </CardHeader>
        {showAdjustment && (
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">المعلم *</label>
                <Select value={adjustTeacher} onValueChange={setAdjustTeacher}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر المعلم" /></SelectTrigger>
                  <SelectContent>
                    {teachers.map(t => (
                      <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">النوع *</label>
                <Select value={adjustType} onValueChange={(v) => setAdjustType(v as "bonus" | "deduction")}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bonus">🎁 مكافأة (إضافة)</SelectItem>
                    <SelectItem value="deduction">📉 خصم (حسم)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">المبلغ (ر.س) *</label>
                <Input type="number" placeholder="0.00" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} className="rounded-xl" min="0" step="0.01" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">ملاحظات</label>
                <Input placeholder="سبب التعديل..." value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)} className="rounded-xl" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="rounded-xl gap-1.5" onClick={submitAdjustment} disabled={adjustLoading}>
                {adjustLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : adjustType === "bonus" ? <Gift className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                {adjustType === "bonus" ? "إضافة مكافأة" : "تطبيق خصم"}
              </Button>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setShowAdjustment(false)}>إلغاء</Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Withdrawal Requests */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-secondary" />
              طلبات سحب الأرباح ({filtered.length})
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusFilter value={statusFilter} onChange={setStatusFilter} options={[
                { value: "pending", label: "قيد المراجعة" }, { value: "approved", label: "تمت الموافقة" },
                { value: "paid", label: "تم الدفع" }, { value: "rejected", label: "مرفوض" },
              ]} />
              <DateFilter dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
              <ExportCSVButton
                data={filtered.map(r => ({ teacher: r.teacher_name, amount: r.amount, status: statusMap[r.status]?.label || r.status, date: new Date(r.created_at).toLocaleDateString("ar-SA"), notes: r.teacher_notes || "" }))}
                headers={[{ key: "teacher", label: "المعلم" }, { key: "amount", label: "المبلغ" }, { key: "status", label: "الحالة" }, { key: "date", label: "التاريخ" }, { key: "notes", label: "ملاحظات" }]}
                filename="سحب_الأرباح"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">لا توجد طلبات سحب</p>
          ) : (
            <div className="space-y-3">
              {filtered.map((r: any) => {
                const s = statusMap[r.status] || statusMap.pending;
                const isExpanded = expandedId === r.id;
                return (
                  <div key={r.id} className="p-4 bg-muted/30 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-bold text-sm text-foreground">{r.teacher_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {Number(r.amount).toLocaleString()} ر.س • {new Date(r.created_at).toLocaleDateString("ar-SA")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={s.variant} className="text-xs">{s.label}</Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>

                    {r.teacher_notes && (
                      <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">📝 ملاحظات المعلم: {r.teacher_notes}</p>
                    )}
                    {r.attachment_url && (
                      <a
                        href={r.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <FileText className="h-3.5 w-3.5" />
                        {r.attachment_name || "تحميل المرفق"}
                      </a>
                    )}

                    {isExpanded && (
                      <div className="space-y-2 pt-2 border-t border-border/50">
                        {r.bank_info && (r.bank_info.bank_name || r.bank_info.iban) && (
                          <div className="p-3 rounded-lg bg-secondary/5 border border-secondary/20 space-y-1">
                            <p className="text-xs font-bold text-foreground flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5 text-secondary" /> بيانات الدفع البنكية</p>
                            {r.bank_info.bank_name && <p className="text-xs text-muted-foreground">🏦 البنك: {r.bank_info.bank_name}</p>}
                            {r.bank_info.iban && <p className="text-xs text-muted-foreground font-mono" dir="ltr">IBAN: {r.bank_info.iban}</p>}
                            {r.bank_info.account_holder_name && <p className="text-xs text-muted-foreground">👤 صاحب الحساب: {r.bank_info.account_holder_name}</p>}
                          </div>
                        )}
                        {r.bank_info && !r.bank_info.bank_name && !r.bank_info.iban && (
                          <p className="text-xs text-destructive bg-destructive/5 rounded-lg p-2">⚠️ لم يُضف المعلم بيانات الدفع البنكية بعد</p>
                        )}
                        {r.status === "pending" && (
                          <>
                            <Textarea
                              placeholder="ملاحظات الإدارة (اختياري)..."
                              value={adminNotes[r.id] || ""}
                              onChange={(e) => setAdminNotes(prev => ({ ...prev, [r.id]: e.target.value }))}
                              className="min-h-[60px] rounded-xl resize-none text-sm"
                            />
                            <div className="flex gap-2">
                              <Button size="sm" className="rounded-lg bg-secondary hover:bg-secondary/90 text-secondary-foreground gap-1 text-xs flex-1" onClick={() => updateStatus(r.id, "paid", r.teacher_id)}>
                                <CheckCircle className="h-3.5 w-3.5" /> دفع
                              </Button>
                              <Button size="sm" variant="destructive" className="rounded-lg gap-1 text-xs flex-1" onClick={() => updateStatus(r.id, "rejected", r.teacher_id)}>
                                <XCircle className="h-3.5 w-3.5" /> رفض
                              </Button>
                            </div>
                          </>
                        )}
                        {r.admin_notes && (
                          <p className="text-xs text-muted-foreground bg-primary/5 rounded-lg p-2">💬 رد الإدارة: {r.admin_notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}