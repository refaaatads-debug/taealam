import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function WithdrawalSection() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;

    // Calculate balance from completed bookings
    const { data: completed } = await supabase
      .from("bookings")
      .select("price")
      .eq("teacher_id", user.id)
      .eq("status", "completed");
    const totalEarned = (completed ?? []).reduce((sum, b) => sum + (Number(b.price) || 0), 0);

    // Get total paid out
    const { data: payments } = await supabase
      .from("teacher_payments" as any)
      .select("amount")
      .eq("teacher_id", user.id);
    const totalPaid = (payments as any[] ?? []).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

    // Get pending withdrawal amounts
    const { data: pendingW } = await supabase
      .from("withdrawal_requests" as any)
      .select("amount")
      .eq("teacher_id", user.id)
      .eq("status", "pending");
    const pendingAmount = (pendingW as any[] ?? []).reduce((sum: number, w: any) => sum + (Number(w.amount) || 0), 0);

    setBalance(totalEarned - totalPaid - pendingAmount);

    // Fetch withdrawal history
    const { data: wData } = await supabase
      .from("withdrawal_requests" as any)
      .select("*")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    setWithdrawals(wData as any[] || []);
  };

  const requestWithdrawal = async () => {
    if (!user || balance <= 0) {
      toast.error("لا يوجد رصيد كافٍ للسحب");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from("withdrawal_requests" as any)
        .insert({ teacher_id: user.id, amount: balance } as any);
      if (error) throw error;

      // Notify admin
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "تم إرسال طلب سحب أرباح 💰",
        body: `تم إرسال طلب سحب بمبلغ ${balance} ر.س وسيتم مراجعته من قبل الإدارة`,
        type: "withdrawal",
      });

      toast.success("تم إرسال طلب السحب بنجاح!");
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
          <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
            <DollarSign className="h-4 w-4 text-green-600" />
          </div>
          سحب الأرباح
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 rounded-2xl bg-green-50 dark:bg-green-950/20 border border-green-200/50 dark:border-green-800/30">
          <div>
            <p className="text-sm text-muted-foreground">الرصيد المتاح</p>
            <p className="text-2xl font-black text-foreground">{balance.toLocaleString()} ر.س</p>
          </div>
          <Button
            onClick={requestWithdrawal}
            disabled={loading || balance <= 0}
            className="gradient-cta text-secondary-foreground rounded-xl shadow-button gap-1.5"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            طلب سحب
          </Button>
        </div>

        {withdrawals.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-bold text-foreground">سجل الطلبات</p>
            {withdrawals.map((w: any) => {
              const s = statusMap[w.status] || statusMap.pending;
              return (
                <div key={w.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                  <div>
                    <p className="font-bold text-sm text-foreground">{Number(w.amount).toLocaleString()} ر.س</p>
                    <p className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleDateString("ar-SA")}</p>
                  </div>
                  <Badge variant={s.variant} className="text-xs">{s.label}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
