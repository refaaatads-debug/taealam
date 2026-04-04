import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function WithdrawalRequestsTab() {
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const { data } = await supabase
      .from("withdrawal_requests" as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (data && (data as any[]).length > 0) {
      const teacherIds = [...new Set((data as any[]).map((r: any) => r.teacher_id))];
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", teacherIds);
      const nameMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));
      setRequests((data as any[]).map((r: any) => ({ ...r, teacher_name: nameMap.get(r.teacher_id) || "معلم" })));
    } else {
      setRequests([]);
    }
  };

  const updateStatus = async (id: string, status: string, teacherId: string) => {
    await supabase.from("withdrawal_requests" as any).update({ status } as any).eq("id", id);

    if (status === "paid") {
      const req = requests.find(r => r.id === id);
      if (req) {
        await supabase.from("teacher_payments" as any).insert({
          teacher_id: teacherId,
          amount: req.amount,
          withdrawal_request_id: id,
          notes: "دفع عبر تحويل بنكي",
        } as any);
      }
    }

    await supabase.from("notifications").insert({
      user_id: teacherId,
      title: status === "paid" ? "تم تحويل أرباحك! 💰" : status === "rejected" ? "تم رفض طلب السحب ❌" : "تم تحديث طلب السحب",
      body: status === "paid" ? "تم تحويل المبلغ المطلوب إلى حسابك البنكي" : status === "rejected" ? "تم رفض طلب سحب الأرباح. تواصل مع الإدارة للمزيد" : "",
      type: "withdrawal",
    });

    toast.success("تم تحديث الطلب");
    fetchData();
  };

  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "قيد المراجعة", variant: "outline" },
    approved: { label: "تمت الموافقة", variant: "secondary" },
    paid: { label: "تم الدفع", variant: "default" },
    rejected: { label: "مرفوض", variant: "destructive" },
  };

  return (
    <Card className="border-0 shadow-card">
      <CardHeader>
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-600" />
          طلبات سحب الأرباح ({requests.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">لا توجد طلبات سحب</p>
        ) : (
          <div className="space-y-3">
            {requests.map((r: any) => {
              const s = statusMap[r.status] || statusMap.pending;
              return (
                <div key={r.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                  <div>
                    <p className="font-bold text-sm text-foreground">{r.teacher_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {Number(r.amount).toLocaleString()} ر.س • {new Date(r.created_at).toLocaleDateString("ar-SA")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.variant} className="text-xs">{s.label}</Badge>
                    {r.status === "pending" && (
                      <>
                        <Button size="sm" className="rounded-lg bg-green-600 hover:bg-green-700 text-white gap-1 text-xs h-7" onClick={() => updateStatus(r.id, "paid", r.teacher_id)}>
                          <CheckCircle className="h-3.5 w-3.5" /> دفع
                        </Button>
                        <Button size="sm" variant="destructive" className="rounded-lg gap-1 text-xs h-7" onClick={() => updateStatus(r.id, "rejected", r.teacher_id)}>
                          <XCircle className="h-3.5 w-3.5" /> رفض
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
