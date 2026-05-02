import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, CreditCard, Receipt } from "lucide-react";
import type { StudentBundle } from "@/pages/AdminStudentProfile";

const statusMap: Record<string, { label: string; cls: string }> = {
  completed: { label: "مكتمل", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  paid: { label: "مدفوع", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  pending: { label: "قيد الانتظار", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  failed: { label: "فاشل", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  refunded: { label: "مسترجع", cls: "bg-sky-500/15 text-sky-600 border-sky-500/30" },
};

const StudentPaymentsTab = ({ data }: { data: StudentBundle }) => {
  const totalPaid = data.payments.filter((p: any) => ["completed", "paid"].includes(p.status)).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const pending = data.payments.filter((p: any) => p.status === "pending").reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const failed = data.payments.filter((p: any) => p.status === "failed").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">إجمالي المدفوع</div><div className="text-2xl font-bold text-emerald-600">{totalPaid.toFixed(2)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">عدد العمليات</div><div className="text-2xl font-bold">{data.payments.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">معلّقة</div><div className="text-2xl font-bold text-amber-600">{pending.toFixed(2)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">فاشلة</div><div className="text-2xl font-bold text-destructive">{failed}</div></CardContent></Card>
      </div>

      {data.payments.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><Wallet className="h-8 w-8 mx-auto mb-2 opacity-50" />لا توجد عمليات دفع</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-right p-3">التاريخ</th>
                    <th className="text-right p-3">المبلغ</th>
                    <th className="text-right p-3">العملة</th>
                    <th className="text-right p-3">النوع</th>
                    <th className="text-right p-3">الحالة</th>
                    <th className="text-right p-3">المرجع</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p: any) => {
                    const s = statusMap[p.status] || { label: p.status, cls: "bg-muted text-muted-foreground border-border" };
                    return (
                      <tr key={p.id} className="border-t hover:bg-muted/30">
                        <td className="p-3 text-xs">{new Date(p.created_at).toLocaleDateString("ar-SA")}</td>
                        <td className="p-3 font-bold">{Number(p.amount).toFixed(2)}</td>
                        <td className="p-3 text-xs">{p.currency || "SAR"}</td>
                        <td className="p-3 text-xs">{p.payment_type === "subscription" ? "اشتراك" : p.payment_type}</td>
                        <td className="p-3"><Badge variant="outline" className={s.cls}>{s.label}</Badge></td>
                        <td className="p-3 text-[10px] font-mono text-muted-foreground truncate max-w-[120px]">{p.stripe_session_id || p.id.slice(0, 8)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StudentPaymentsTab;
