import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, DollarSign, FileText, Download, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import DateFilter from "./DateFilter";
import ExportCSVButton from "./ExportCSVButton";
import StatusFilter from "./StatusFilter";

export default function WithdrawalRequestsTab() {
  const [requests, setRequests] = useState<any[]>([]);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

  const filtered = requests.filter(r => {
    const created = new Date(r.created_at);
    if (dateFrom && created < new Date(dateFrom)) return false;
    if (dateTo) { const end = new Date(dateTo); end.setHours(23,59,59,999); if (created > end) return false; }
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });

  return (
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

                  {/* Teacher notes & attachment */}
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

                  {/* Expanded: admin notes & actions */}
                  {isExpanded && (
                    <div className="space-y-2 pt-2 border-t border-border/50">
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
  );
}