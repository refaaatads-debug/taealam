import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DateFilter from "./DateFilter";
import ExportCSVButton from "./ExportCSVButton";

export default function TeacherPaymentsTab() {
  const [payments, setPayments] = useState<any[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const { data } = await supabase
      .from("teacher_payments" as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (data && (data as any[]).length > 0) {
      const teacherIds = [...new Set((data as any[]).map((p: any) => p.teacher_id))];
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", teacherIds);
      const nameMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));
      setPayments((data as any[]).map((p: any) => ({ ...p, teacher_name: nameMap.get(p.teacher_id) || "معلم" })));
    } else {
      setPayments([]);
    }
  };

  const filtered = payments.filter(p => {
    const created = new Date(p.created_at);
    if (dateFrom && created < new Date(dateFrom)) return false;
    if (dateTo) { const end = new Date(dateTo); end.setHours(23,59,59,999); if (created > end) return false; }
    return true;
  });

  return (
    <Card className="border-0 shadow-card">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-secondary" />
            سجل مدفوعات المعلمين ({filtered.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <DateFilter dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
            <ExportCSVButton
              data={filtered.map(p => ({ teacher: p.teacher_name, amount: p.amount, method: p.payment_method === "bank_transfer" ? "تحويل بنكي" : p.payment_method, date: new Date(p.created_at).toLocaleDateString("ar-SA"), notes: p.notes || "" }))}
              headers={[{ key: "teacher", label: "المعلم" }, { key: "amount", label: "المبلغ" }, { key: "method", label: "طريقة الدفع" }, { key: "date", label: "التاريخ" }, { key: "notes", label: "ملاحظات" }]}
              filename="مدفوعات_المعلمين"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">لا توجد مدفوعات بعد</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-right pb-3 font-medium">المعلم</th>
                  <th className="text-right pb-3 font-medium">المبلغ</th>
                  <th className="text-right pb-3 font-medium">طريقة الدفع</th>
                  <th className="text-right pb-3 font-medium">التاريخ</th>
                  <th className="text-right pb-3 font-medium">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((p: any) => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="py-3 font-medium text-foreground">{p.teacher_name}</td>
                    <td className="py-3 text-foreground">{Number(p.amount).toLocaleString()} ر.س</td>
                    <td className="py-3">
                      <Badge variant="outline" className="text-xs">
                        {p.payment_method === "bank_transfer" ? "تحويل بنكي" : p.payment_method}
                      </Badge>
                    </td>
                    <td className="py-3 text-muted-foreground text-xs">{new Date(p.created_at).toLocaleDateString("ar-SA")}</td>
                    <td className="py-3 text-muted-foreground text-xs">{p.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
