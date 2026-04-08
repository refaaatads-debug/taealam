import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Plus, Loader2, TrendingUp, Users, Pencil, Check, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import DateFilter from "./DateFilter";
import ExportCSVButton from "./ExportCSVButton";

const STATUS_OPTIONS = [
  { value: "confirmed", label: "مؤكدة", variant: "default" as const },
  { value: "unconfirmed", label: "غير مؤكدة", variant: "destructive" as const },
  { value: "in_progress", label: "جارية", variant: "secondary" as const },
];

const getStatusInfo = (status: string) =>
  STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];

export default function TeacherEarningsTab() {
  const { user } = useAuth();
  const [earnings, setEarnings] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Computed hours per teacher per month
  const [teacherHoursMap, setTeacherHoursMap] = useState<Map<string, number>>(new Map());

  // Form state
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("confirmed");

  useEffect(() => { fetchData(); }, []);

  // Fetch computed hours when teacher or month changes
  useEffect(() => {
    if (selectedTeacher && month) {
      fetchTeacherHours(selectedTeacher, month);
    }
  }, [selectedTeacher, month]);

  const fetchTeacherHours = async (teacherId: string, monthStr: string) => {
    // monthStr format: "2026-04"
    const [year, m] = monthStr.split("-");
    const startDate = `${year}-${m}-01`;
    const endMonth = parseInt(m) === 12 ? 1 : parseInt(m) + 1;
    const endYear = parseInt(m) === 12 ? parseInt(year) + 1 : parseInt(year);
    const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

    const { data } = await supabase
      .from("teacher_daily_stats")
      .select("total_minutes")
      .eq("teacher_id", teacherId)
      .gte("date", startDate)
      .lt("date", endDate);

    const totalMin = (data ?? []).reduce((sum, d) => sum + (d.total_minutes || 0), 0);
    setTeacherHoursMap(prev => new Map(prev).set(`${teacherId}_${monthStr}`, totalMin));
  };

  const getComputedHours = () => {
    const key = `${selectedTeacher}_${month}`;
    const minutes = teacherHoursMap.get(key) || 0;
    return { minutes, hours: Math.round((minutes / 60) * 100) / 100 };
  };

  const fetchData = async () => {
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

  const resetForm = () => {
    setSelectedTeacher("");
    setAmount("");
    setNotes("");
    setStatus("confirmed");
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (e: any) => {
    setEditingId(e.id);
    setSelectedTeacher(e.teacher_id);
    setAmount(String(e.amount));
    setMonth(e.month);
    setNotes(e.notes || "");
    setStatus(e.status || "confirmed");
    setShowForm(true);
  };

  const saveEarning = async () => {
    if (!selectedTeacher || !amount || !month) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("المبلغ غير صحيح");
      return;
    }

    const { hours } = getComputedHours();

    setLoading(true);
    try {
      if (editingId) {
        const oldEarning = earnings.find(e => e.id === editingId);
        const { error } = await supabase
          .from("teacher_earnings" as any)
          .update({ amount: amountNum, month, notes: notes || null, status, hours } as any)
          .eq("id", editingId);
        if (error) throw error;

        if (oldEarning && oldEarning.amount !== amountNum) {
          const diff = amountNum - Number(oldEarning.amount);
          const teacher = teachers.find(t => t.user_id === selectedTeacher);
          if (teacher) {
            await supabase.from("teacher_profiles")
              .update({ balance: (teacher.balance || 0) + diff } as any)
              .eq("user_id", selectedTeacher);
          }
        }

        await supabase.from("system_logs").insert({
          level: "info", source: "admin_earnings",
          message: `تعديل أرباح ID: ${editingId} - المبلغ: ${amountNum} ر.س - الساعات: ${hours}`,
          user_id: user?.id, metadata: { earning_id: editingId, amount: amountNum, hours, status, month },
        });

        toast.success("تم تعديل الأرباح بنجاح!");
      } else {
        const { error } = await supabase
          .from("teacher_earnings" as any)
          .insert({ teacher_id: selectedTeacher, amount: amountNum, month, notes: notes || null, added_by_admin: user?.id, status, hours } as any);
        
        if (error) {
          if (error.code === "23505") {
            toast.error(`يوجد أرباح مسجلة لهذا المعلم في شهر ${month} بالفعل`);
            setLoading(false);
            return;
          }
          throw error;
        }

        await supabase.from("teacher_profiles")
          .update({ balance: (teachers.find(t => t.user_id === selectedTeacher)?.balance || 0) + amountNum } as any)
          .eq("user_id", selectedTeacher);

        await supabase.from("notifications").insert({
          user_id: selectedTeacher,
          title: "تم إضافة أرباح جديدة 💰",
          body: `تم إضافة مبلغ ${amountNum.toLocaleString()} ر.س لحسابك عن شهر ${month} (${hours} ساعة عمل)`,
          type: "payment",
        });

        await supabase.from("system_logs").insert({
          level: "info", source: "admin_earnings",
          message: `إضافة أرباح ${amountNum} ر.س للمعلم ${selectedTeacher} عن شهر ${month} - ${hours} ساعة`,
          user_id: user?.id, metadata: { teacher_id: selectedTeacher, amount: amountNum, hours, month, status },
        });

        toast.success("تم إضافة الأرباح بنجاح!");
      }

      resetForm();
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
  const computedHours = getComputedHours();

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
              <Button size="sm" className="rounded-xl gap-1.5 text-xs" onClick={() => { resetForm(); setShowForm(!showForm); }}>
                <Plus className="h-3.5 w-3.5" />
                إضافة أرباح
              </Button>
              <DateFilter dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
              <ExportCSVButton
                data={filtered.map(e => ({ teacher: e.teacher_name, amount: e.amount, hours: e.hours || 0, month: e.month, status: getStatusInfo(e.status).label, notes: e.notes || "", date: new Date(e.created_at).toLocaleDateString("ar-SA") }))}
                headers={[{ key: "teacher", label: "المعلم" }, { key: "amount", label: "المبلغ" }, { key: "hours", label: "الساعات" }, { key: "month", label: "الشهر" }, { key: "status", label: "الحالة" }, { key: "notes", label: "ملاحظات" }, { key: "date", label: "تاريخ الإضافة" }]}
                filename="أرباح_المعلمين"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add/Edit Form */}
          {showForm && (
            <div className="p-4 rounded-xl bg-accent/30 border border-border space-y-3">
              <h4 className="font-bold text-sm">{editingId ? "تعديل الأرباح" : "إضافة أرباح يدوية"}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">المعلم *</label>
                  <Select value={selectedTeacher} onValueChange={setSelectedTeacher} disabled={!!editingId}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر المعلم" /></SelectTrigger>
                    <SelectContent>
                      {teachers.map(t => (
                        <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">الشهر *</label>
                  <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl" />
                </div>

                {/* Computed hours - read only */}
                {selectedTeacher && month && (
                  <div className="md:col-span-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-primary" />
                      <span className="text-sm font-bold text-foreground">ساعات العمل المحسوبة</span>
                    </div>
                    <p className="text-lg font-black text-primary">
                      {computedHours.hours} ساعة ({computedHours.minutes} دقيقة)
                    </p>
                    <p className="text-[10px] text-muted-foreground">محسوبة تلقائياً من الجلسات المكتملة (≥5 دقائق)</p>
                  </div>
                )}

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">المبلغ (ر.س) *</label>
                  <Input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} className="rounded-xl" min="0" step="0.01" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">الحالة *</label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">ملاحظات</label>
                  <Textarea placeholder="ملاحظات اختيارية..." value={notes} onChange={e => setNotes(e.target.value)} className="rounded-xl resize-none min-h-[40px]" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="rounded-xl gap-1.5" onClick={saveEarning} disabled={loading}>
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {editingId ? "حفظ التعديل" : "إضافة"}
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl" onClick={resetForm}>إلغاء</Button>
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
                    <th className="text-right pb-3 font-medium">الساعات</th>
                    <th className="text-right pb-3 font-medium">المبلغ</th>
                    <th className="text-right pb-3 font-medium">الشهر</th>
                    <th className="text-right pb-3 font-medium">تاريخ الإضافة</th>
                    <th className="text-right pb-3 font-medium">ملاحظات</th>
                    <th className="text-right pb-3 font-medium">الحالة</th>
                    <th className="text-right pb-3 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((e: any) => {
                    const si = getStatusInfo(e.status);
                    return (
                      <tr key={e.id} className="hover:bg-muted/30">
                        <td className="py-3 font-medium text-foreground">{e.teacher_name}</td>
                        <td className="py-3 text-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {e.hours ? `${Number(e.hours).toFixed(1)} ساعة` : "—"}
                          </span>
                        </td>
                        <td className="py-3 text-foreground">{Number(e.amount).toLocaleString()} ر.س</td>
                        <td className="py-3"><Badge variant="outline" className="text-xs">{e.month}</Badge></td>
                        <td className="py-3 text-muted-foreground text-xs">{new Date(e.created_at).toLocaleDateString("ar-SA")}</td>
                        <td className="py-3 text-muted-foreground text-xs">{e.notes || "—"}</td>
                        <td className="py-3"><Badge variant={si.variant} className="text-xs">{si.label}</Badge></td>
                        <td className="py-3">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(e)}>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
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
