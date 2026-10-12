import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DollarSign, Loader2, Send, Paperclip, FileText, X, Download, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function WithdrawalSection() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [minWithdrawal, setMinWithdrawal] = useState(100);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [manualEarnings, setManualEarnings] = useState<any[]>([]);
  const [currentMonthNet, setCurrentMonthNet] = useState(0);
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    void fetchData();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { void fetchData(); }, 150);
    };
    const channel = supabase
      .channel(`teacher-financial-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_earnings", filter: `teacher_id=eq.${user.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests", filter: `teacher_id=eq.${user.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_payments", filter: `teacher_id=eq.${user.id}` }, refresh)
      .subscribe();
    window.addEventListener("focus", refresh);
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener("focus", refresh);
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchData = async () => {
    if (!user) return;

    const currentMonth = new Date().toISOString().slice(0, 7);
    const [breakdownRes, settingsRes, earningsRes, wData, monthBreakdown] = await Promise.all([
      supabase.rpc("get_teacher_earnings_breakdown", { _teacher_id: user.id }),
      supabase.from("financial_settings" as any).select("min_withdrawal_amount").maybeSingle(),
      supabase.from("teacher_earnings" as any).select("amount, month, hours, created_at, status, earning_type, rollover_source_month").eq("teacher_id", user.id).order("created_at", { ascending: false }),
      supabase.from("withdrawal_requests" as any).select("*").eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(10),
      supabase.rpc("get_teacher_net_summary", { _teacher_id: user.id, _month: currentMonth }),
    ]);

    const financialError = breakdownRes.error || monthBreakdown.error || earningsRes.error || wData.error;
    if (financialError) {
      console.error("[teacher-withdrawal] failed to load financial summary:", financialError);
      toast.error("تعذر تحديث بيانات الأرباح والسحب. أعد المحاولة بعد قليل.");
      return;
    }

    const bd = breakdownRes.data?.[0];
    setTotalEarnings(Number(bd?.paid_total) || 0);
    const availableBalance = Number(bd?.available_balance) || 0;
    setBalance(availableBalance);
    setWithdrawalAmount(current => {
      const currentAmount = Number(current);
      return !current || !Number.isFinite(currentAmount) || currentAmount > availableBalance
        ? availableBalance > 0 ? availableBalance.toFixed(2) : ""
        : current;
    });
    setMinWithdrawal(Number((settingsRes.data as any)?.min_withdrawal_amount) || 100);
    setManualEarnings((earningsRes.data as any[]) || []);
    setWithdrawals((wData.data as any[]) || []);
    // Teacher view: only the net (final amount due). Internal breakdown remains admin-only.
    setCurrentMonthNet(Number(monthBreakdown.data?.[0]?.net_total) || 0);
  };

  const requestWithdrawal = async () => {
    if (!user || balance <= 0) {
      toast.error("لا يوجد رصيد كافٍ للسحب");
      return;
    }
    const amount = Number(withdrawalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("أدخل مبلغاً صحيحاً للسحب");
      return;
    }
    if (amount < minWithdrawal) {
      toast.error(`الحد الأدنى للسحب هو ${minWithdrawal} ر.س`);
      return;
    }
    if (amount > balance + 0.01) {
      toast.error("مبلغ السحب أكبر من الرصيد المتاح");
      return;
    }
    setLoading(true);
    try {
      let attachmentUrl = null;
      let attachmentName = null;

      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("support-files")
          .upload(path, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("support-files").getPublicUrl(path);
        attachmentUrl = urlData.publicUrl;
        attachmentName = file.name;
      }

      const { error } = await supabase
        .from("withdrawal_requests" as any)
        .insert({
          teacher_id: user.id,
          amount,
          teacher_notes: notes || null,
          attachment_url: attachmentUrl,
          attachment_name: attachmentName,
        } as any);
      if (error) throw error;

      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "تم إرسال طلب سحب أرباح 💰",
        body: `تم إرسال طلب سحب بمبلغ ${amount.toLocaleString()} ر.س وسيتم مراجعته من قبل الإدارة`,
        type: "withdrawal",
      });

      toast.success("تم إرسال طلب السحب بنجاح!");
      setWithdrawalAmount("");
      setNotes("");
      setFile(null);
      await fetchData();
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setLoading(false);
    }
  };

  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "قيد المراجعة", variant: "outline" },
    approved: { label: "تمت الموافقة", variant: "secondary" },
    paid: { label: "تم الدفع", variant: "default" },
    rejected: { label: "مرفوض", variant: "destructive" },
  };

  return (
    <Card className="border-0 shadow-card">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-right p-4 sm:p-6 flex items-center justify-between hover:bg-muted/30 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-secondary" />
          </div>
          <div className="text-right">
            <p className="text-base sm:text-lg font-bold leading-tight">سحب الأرباح</p>
            <p className="text-xs text-muted-foreground">المتاح: <strong className="text-foreground">{balance.toLocaleString()} ر.س</strong></p>
          </div>
        </div>
        {open ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
      </button>
      {open && (
      <CardContent className="space-y-4 pt-0">

        {/* Teacher-only summary (no internal accounting details) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">إجمالي الأرباح المدفوعة</p>
            <p className="text-xl font-black text-foreground">{totalEarnings.toLocaleString()} ر.س</p>
          </div>
          <div className="rounded-2xl border border-secondary/20 bg-secondary/5 p-4">
            <p className="text-xs text-muted-foreground mb-1">الرصيد المتاح للسحب</p>
            <p className="text-xl font-black text-secondary">{balance.toLocaleString()} ر.س</p>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-xs text-muted-foreground mb-1">إجمالي أرباح هذا الشهر</p>
            <p className="text-xl font-black text-primary">{currentMonthNet.toLocaleString()} ر.س</p>
          </div>
        </div>

        {/* Notes & Attachment */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="teacher-withdrawal-amount" className="text-sm font-medium">
              مبلغ السحب (ر.س)
            </label>
            <Input
              id="teacher-withdrawal-amount"
              type="number"
              inputMode="decimal"
              min={minWithdrawal}
              max={balance}
              step="0.01"
              value={withdrawalAmount}
              onChange={e => setWithdrawalAmount(e.target.value)}
              disabled={loading || balance <= 0}
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              الحد الأدنى {minWithdrawal.toLocaleString()} ر.س — المتاح {balance.toLocaleString()} ر.س. يمكنك طلب جزء من الرصيد.
            </p>
          </div>
          <Textarea
            placeholder="أضف ملاحظات مع طلب السحب (اختياري)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[80px] rounded-xl resize-none"
          />

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl gap-1.5 text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-3.5 w-3.5" />
              إرفاق ملف
            </Button>
            {file && (
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 text-xs">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span className="truncate max-w-[150px]">{file.name}</span>
                <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          <Button
            onClick={requestWithdrawal}
            disabled={loading || balance <= 0}
            className="w-full gradient-cta text-secondary-foreground rounded-xl shadow-button gap-1.5"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            طلب سحب الأرباح
          </Button>
        </div>

        {/* Manual earnings ledger */}
        {manualEarnings.length > 0 && (() => {
          type ManualEarningGroup = { month: string; earningType: string; rolloverSourceMonth: string | null; amount: number; hours: number; statuses: Set<string> };
          const byMonth = manualEarnings.reduce<Record<string, ManualEarningGroup>>((acc, e: any) => {
            const m = e.month || "—";
            const earningType = e.earning_type || "monthly_transfer";
            const rolloverSourceMonth = e.rollover_source_month || null;
            const key = `${m}:${earningType}:${rolloverSourceMonth || ""}`;
            if (!acc[key]) acc[key] = { month: m, earningType, rolloverSourceMonth, amount: 0, hours: 0, statuses: new Set() };
            acc[key].amount += Number(e.amount) || 0;
            acc[key].hours += Number(e.hours) || 0;
            acc[key].statuses.add(e.status);
            return acc;
          }, {});
          const entries = Object.values(byMonth).sort((a, b) => b.month.localeCompare(a.month) || a.earningType.localeCompare(b.earningType));
          return (
            <div className="space-y-2">
              <p className="text-sm font-bold text-foreground">سجل الأرباح المضافة</p>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs">
                    <tr>
                      <th className="p-2 text-right font-bold">الشهر</th>
                      <th className="p-2 text-right font-bold">النوع</th>
                      <th className="p-2 text-right font-bold">الساعات</th>
                      <th className="p-2 text-right font-bold">المبلغ</th>
                      <th className="p-2 text-right font-bold">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(data => {
                      const isPaid = data.statuses.has("paid") && data.statuses.size === 1;
                      const isConfirmed = data.statuses.has("confirmed");
                      const label = isPaid ? "مدفوعة" : isConfirmed ? "مسجلة" : "قيد المراجعة";
                      const variant = isPaid ? "outline" as const : isConfirmed ? "default" as const : "secondary" as const;
                      return (
                        <tr key={`${data.month}:${data.earningType}:${data.rolloverSourceMonth || ""}`} className="border-t">
                          <td className="p-2 font-medium">{data.month}</td>
                          <td className="p-2 text-xs">
                            {data.rolloverSourceMonth
                              ? `ترحيل تلقائي من ${data.rolloverSourceMonth}`
                              : data.earningType === "bonus"
                                ? "مكافأة إضافية"
                                : data.earningType === "deduction"
                                  ? "خصم"
                                  : "تحويل من أرباح الشهر"}
                          </td>
                          <td className="p-2 text-muted-foreground">{data.hours.toFixed(1)} س</td>
                          <td className="p-2 font-bold text-foreground">{data.amount.toLocaleString()} ر.س</td>
                          <td className="p-2"><Badge variant={variant} className="text-xs">{label}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* Withdrawal History */}
        {withdrawals.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-bold text-foreground">سجل الطلبات</p>
            {withdrawals.map((w: any) => {
              const s = statusMap[w.status] || statusMap.pending;
              return (
                <div key={w.id} className="p-3 rounded-xl bg-muted/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm text-foreground">{Number(w.amount).toLocaleString()} ر.س</p>
                      <p className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleDateString("ar-SA")}</p>
                    </div>
                    <Badge variant={s.variant} className="text-xs">{s.label}</Badge>
                  </div>
                  {w.teacher_notes && (
                    <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-2">📝 {w.teacher_notes}</p>
                  )}
                  {w.attachment_url && (
                    <a
                      href={w.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {w.attachment_name || "تحميل المرفق"}
                    </a>
                  )}
                  {w.admin_notes && (
                    <p className="text-xs text-muted-foreground bg-primary/5 rounded-lg p-2">💬 رد الإدارة: {w.admin_notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      )}
    </Card>
  );
}
