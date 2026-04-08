import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Plus, Loader2, TrendingUp, Users, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import DateFilter from "./DateFilter";
import ExportCSVButton from "./ExportCSVButton";

export default function TeacherEarningsTab() {
  const { user } = useAuth();
  const [earnings, setEarnings] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Form state
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // Fetch teachers
    const { data: tps } = await supabase
      .from("teacher_profiles")
      .select("user_id, balance, total_sessions")
      .eq("is_approved", true);

    if (tps && tps.length > 0) {
      const uids = tps.map(t => t.user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", uids);
      const nameMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));
      setTeachers(tps.map(t => ({ ...t, full_name: nameMap.get(t.user_id) || "معلم" })));
    }

    // Fetch earnings
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

  const addEarning = async () => {
    if (!selectedTeacher || !amount || !month) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("المبلغ غير صحيح");
      return;
    }

    // Check for duplicate
    const { data: existing } = await supabase
      .from("teacher_earnings" as any)
      .select("id")
      .eq("teacher_id", selectedTeacher)
      .eq("month", month);

    if (existing && (existing as any[]).length > 0) {
      const confirmed = window.confirm(`يوجد أرباح مسجلة لهذا المعلم في شهر ${month}. هل تريد إضافة مبلغ جديد؟`);
      if (!confirmed) return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("teacher_earnings" as any)
        .insert({
          teacher_id: selectedTeacher,
          amount: amountNum,
          month,
          notes: notes || null,
          added_by_admin: user?.id,
        } as any);

      if (error) throw error;

      // Update teacher balance
      await supabase.from("teacher_profiles")
        .update({ balance: (teachers.find(t => t.user_id === selectedTeacher)?.balance || 0) + amountNum } as any)
        .eq("user_id", selectedTeacher);

      // Notify teacher
      await supabase.from("notifications").insert({
        user_id: selectedTeacher,
        title: "تم إضافة أرباح جديدة 💰",
        body: `تم إضافة مبلغ ${amountNum.toLocaleString()} ر.س لحسابك عن شهر ${month}`,
        type: "payment",
      });

      // Log in system_logs
      await supabase.from("system_logs").insert({
        level: "info",
        source: "admin_earnings",
        message: `إضافة أرباح ${amountNum} ر.س للمعلم ${selectedTeacher} عن شهر ${month}`,
        user_id: user?.id,
        metadata: { teacher_id: selectedTeacher, amount: amountNum, month },
      });

      toast.success("تم إضافة الأرباح بنجاح!");
      setShowForm(false);
      setSelectedTeacher("");
      setAmount("");
      setNotes("");
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
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

      <Card className="border-0 shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-secondary" />
              إدارة أرباح المعلمين ({filtered.length})
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" className="rounded-xl gap-1.5 text-xs" onClick={() => setShowForm(!showForm)}>
                <Plus className="h-3.5 w-3.5" />
                إضافة أرباح
              </Button>
              <DateFilter dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
              <ExportCSVButton
                data={filtered.map(e => ({ teacher: e.teacher_name, amount: e.amount, month: e.month, notes: e.notes || "", date: new Date(e.created_at).toLocaleDateString("ar-SA") }))}
                headers={[{ key: "teacher", label: "المعلم" }, { key: "amount", label: "المبلغ" }, { key: "month", label: "الشهر" }, { key: "notes", label: "ملاحظات" }, { key: "date", label: "تاريخ الإضافة" }]}
                filename="أرباح_المعلمين"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Earnings Form */}
          {showForm && (
            <div className="p-4 rounded-xl bg-accent/30 border border-border space-y-3">
              <h4 className="font-bold text-sm">إضافة أرباح يدوية</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">المعلم *</label>
                  <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="اختر المعلم" />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.map(t => (
                        <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">المبلغ (ر.س) *</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="rounded-xl"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">الشهر *</label>
                  <Input
                    type="month"
                    value={month}
                    onChange={e => setMonth(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">ملاحظات</label>
                  <Textarea
                    placeholder="ملاحظات اختيارية..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="rounded-xl resize-none min-h-[40px]"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="rounded-xl gap-1.5" onClick={addEarning} disabled={loading}>
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  إضافة
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setShowForm(false)}>إلغاء</Button>
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
                    <th className="text-right pb-3 font-medium">المعلم</th>
                    <th className="text-right pb-3 font-medium">المبلغ</th>
                    <th className="text-right pb-3 font-medium">الشهر</th>
                    <th className="text-right pb-3 font-medium">تاريخ الإضافة</th>
                    <th className="text-right pb-3 font-medium">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((e: any) => (
                    <tr key={e.id} className="hover:bg-muted/30">
                      <td className="py-3 font-medium text-foreground">{e.teacher_name}</td>
                      <td className="py-3 text-foreground">{Number(e.amount).toLocaleString()} ر.س</td>
                      <td className="py-3">
                        <Badge variant="outline" className="text-xs">{e.month}</Badge>
                      </td>
                      <td className="py-3 text-muted-foreground text-xs">{new Date(e.created_at).toLocaleDateString("ar-SA")}</td>
                      <td className="py-3 text-muted-foreground text-xs">{e.notes || "—"}</td>
                    </tr>
                  ))}
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
            أعلى المعلمين بالرصيد
          </CardTitle>
        </CardHeader>
        <CardContent>
          {teachers.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground">لا يوجد معلمين</p>
          ) : (
            <div className="space-y-2">
              {[...teachers]
                .sort((a, b) => (b.balance || 0) - (a.balance || 0))
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
                    <p className="font-black text-sm text-foreground">{Number(t.balance || 0).toLocaleString()} ر.س</p>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
