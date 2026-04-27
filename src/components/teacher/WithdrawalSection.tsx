import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { DollarSign, Loader2, Send, Paperclip, FileText, X, Download, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function WithdrawalSection() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [manualEarnings, setManualEarnings] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;

    // Get all confirmed earnings (total from admin)
    const [earningsRes, paymentsRes, pendingWRes, wData] = await Promise.all([
      supabase.from("teacher_earnings" as any).select("amount, month, hours, created_at, status").eq("teacher_id", user.id).order("created_at", { ascending: false }),
      supabase.from("teacher_payments" as any).select("amount").eq("teacher_id", user.id),
      supabase.from("withdrawal_requests" as any).select("amount").eq("teacher_id", user.id).eq("status", "pending"),
      supabase.from("withdrawal_requests" as any).select("*").eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(10),
    ]);

    const allEarnings = earningsRes.data as any[] ?? [];
    const confirmedEarnings = allEarnings.filter((e: any) => e.status === "confirmed" || e.status === "paid");
    const totalConfirmed = confirmedEarnings.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
    
    const totalPaid = (paymentsRes.data as any[] ?? []).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
    const pendingAmount = (pendingWRes.data as any[] ?? []).reduce((sum: number, w: any) => sum + (Number(w.amount) || 0), 0);

    setTotalEarnings(totalConfirmed);
    setBalance(Math.max(0, totalConfirmed - totalPaid - pendingAmount));
    setManualEarnings(allEarnings);
    setWithdrawals(wData.data as any[] || []);
  };

  const requestWithdrawal = async () => {
    if (!user || balance <= 0) {
      toast.error("لا يوجد رصيد كافٍ للسحب");
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
          amount: balance,
          teacher_notes: notes || null,
          attachment_url: attachmentUrl,
          attachment_name: attachmentName,
        } as any);
      if (error) throw error;

      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "تم إرسال طلب سحب أرباح 💰",
        body: `تم إرسال طلب سحب بمبلغ ${balance} ر.س وسيتم مراجعته من قبل الإدارة`,
        type: "withdrawal",
      });

      toast.success("تم إرسال طلب السحب بنجاح!");
      setNotes("");
      setFile(null);
      fetchData();
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
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
            <DollarSign className="h-4 w-4 text-secondary" />
          </div>
          سحب الأرباح
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Balance Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-accent/50 border border-secondary/20">
            <p className="text-sm text-muted-foreground">الرصيد المتاح للسحب</p>
            <p className="text-2xl font-black text-foreground">{balance.toLocaleString()} ر.س</p>
          </div>
          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20">
            <p className="text-sm text-muted-foreground">إجمالي الأرباح المقررة</p>
            <p className="text-2xl font-black text-primary">{totalEarnings.toLocaleString()} ر.س</p>
          </div>
        </div>

        {/* Notes & Attachment */}
        <div className="space-y-3">
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

        {/* Monthly Earnings Table */}
        {manualEarnings.length > 0 && (() => {
          const byMonth = manualEarnings.reduce((acc: Record<string, { amount: number; hours: number; statuses: Set<string> }>, e: any) => {
            const m = e.month || "—";
            if (!acc[m]) acc[m] = { amount: 0, hours: 0, statuses: new Set() };
            acc[m].amount += Number(e.amount) || 0;
            acc[m].hours += Number(e.hours) || 0;
            acc[m].statuses.add(e.status);
            return acc;
          }, {});
          const months = Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0]));
          return (
            <div className="space-y-2">
              <p className="text-sm font-bold text-foreground">الأرباح الشهرية</p>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs">
                    <tr>
                      <th className="p-2 text-right font-bold">الشهر</th>
                      <th className="p-2 text-right font-bold">الساعات</th>
                      <th className="p-2 text-right font-bold">المبلغ</th>
                      <th className="p-2 text-right font-bold">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map(([month, raw]) => {
                      const data = raw as { amount: number; hours: number; statuses: Set<string> };
                      const isPaid = data.statuses.has("paid") && data.statuses.size === 1;
                      const isConfirmed = data.statuses.has("confirmed");
                      const label = isPaid ? "مدفوعة" : isConfirmed ? "مؤكدة" : "قيد المراجعة";
                      const variant = isPaid ? "outline" as const : isConfirmed ? "default" as const : "secondary" as const;
                      return (
                        <tr key={month} className="border-t">
                          <td className="p-2 font-medium">{month}</td>
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
    </Card>
  );
}
