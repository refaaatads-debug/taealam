import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Users, Loader2, Save, UserCheck, Home, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isValidInPersonDuration } from "@/lib/inPersonDuration";

type InPersonTeacherPrice = {
  teacher_id: string;
  full_name: string;
  override_rate_sar: number | null;
  effective_rate_sar: number;
  pricing_source: "default" | "custom";
};

export default function SessionPricingTab() {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [globalRate, setGlobalRate] = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState("all");
  const [individualRate, setIndividualRate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMode, setActiveMode] = useState<"online" | "in_person">("online");
  const [durationSettingsId, setDurationSettingsId] = useState<string | null>(null);
  const [inPersonDuration, setInPersonDuration] = useState(60);
  const [inPersonDurationInput, setInPersonDurationInput] = useState("60");
  const [inPersonDefault, setInPersonDefault] = useState(60);
  const [inPersonDefaultInput, setInPersonDefaultInput] = useState("60");
  const [inPersonTeachers, setInPersonTeachers] = useState<InPersonTeacherPrice[]>([]);
  const [inPersonTeacher, setInPersonTeacher] = useState("");
  const [inPersonRateInput, setInPersonRateInput] = useState("");
  const [unifyOpen, setUnifyOpen] = useState(false);

  useEffect(() => { fetchTeachers(); }, []);

  const fetchTeachers = async () => {
    setLoading(true);
    const { data: tps } = await supabase
      .from("teacher_profiles")
      .select("user_id, hourly_rate, is_approved")
      .eq("is_approved", true);

    if (tps && tps.length > 0) {
      const uids = tps.map(t => t.user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", uids);
      const nameMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));
      setTeachers(tps.map(t => ({ ...t, full_name: nameMap.get(t.user_id) || "معلم" })));
    }
    const { data: pricing, error: pricingError } = await supabase.rpc("admin_get_in_person_pricing" as any);
    if (pricingError) {
      toast.error("تعذر تحميل أسعار الحصص الحضورية");
    } else if (pricing) {
      const result = pricing as any;
      const defaultRate = Number(result.default_teacher_rate_sar ?? 60);
      setInPersonDefault(defaultRate);
      setInPersonDefaultInput(String(defaultRate));
      setInPersonTeachers((result.teachers ?? []) as InPersonTeacherPrice[]);
    }
    const { data: durationSettings, error: durationError } = await supabase
      .from("financial_settings" as any)
      .select("id,in_person_instruction_duration_minutes")
      .maybeSingle();
    if (durationError || !durationSettings) {
      toast.error("تعذر تحميل مدة الحصة الحضورية");
    } else {
      const settings = durationSettings as unknown as { id: string; in_person_instruction_duration_minutes: number | null };
      const duration = Number(settings.in_person_instruction_duration_minutes ?? 60);
      setDurationSettingsId(settings.id);
      setInPersonDuration(duration);
      setInPersonDurationInput(String(duration));
    }
    setLoading(false);
  };

  const readInPersonRate = (raw: string) => {
    if (!raw.trim()) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
  };

  const saveInPersonDefault = async () => {
    const rate = readInPersonRate(inPersonDefaultInput);
    if (rate === null) { toast.error("أدخل مبلغًا من 0 إلى 100 ر.س"); return; }
    setSaving(true);
    const { error } = await supabase.rpc("admin_set_in_person_default_rate" as any, { p_rate: rate });
    if (error) toast.error("تعذر حفظ السعر الافتراضي");
    else { toast.success("تم تحديث السعر الافتراضي؛ الأسعار الخاصة بالمعلمين لم تتغير"); await fetchTeachers(); }
    setSaving(false);
  };

  const saveInPersonDuration = async () => {
    const duration = Number(inPersonDurationInput);
    if (!isValidInPersonDuration(duration)) {
      toast.error("أدخل مدة صحيحة كعدد صحيح من 15 إلى 180 دقيقة");
      return;
    }
    if (!durationSettingsId) {
      toast.error("تعذر تحديد إعدادات مدة الحصة؛ أعد تحميل الصفحة");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("financial_settings" as any)
      .update({ in_person_instruction_duration_minutes: duration, updated_at: new Date().toISOString() })
      .eq("id", durationSettingsId);
    if (error) {
      toast.error("تعذر حفظ مدة الحصة الحضورية");
    } else {
      setInPersonDuration(duration);
      toast.success(`تم حفظ مدة التدريس الحضوري (${duration} دقيقة) للحجوزات الجديدة`);
    }
    setSaving(false);
  };

  const saveInPersonTeacherRate = async (rate: number | null) => {
    if (!inPersonTeacher) { toast.error("اختر معلمًا أولًا"); return; }
    if (rate === null && inPersonRateInput.trim()) { toast.error("أدخل مبلغًا من 0 إلى 100 ر.س"); return; }
    setSaving(true);
    const { error } = await supabase.rpc("admin_set_teacher_in_person_rate" as any, {
      p_teacher_id: inPersonTeacher, p_rate: rate,
    });
    if (error) toast.error("تعذر حفظ سعر المعلم");
    else { toast.success(rate === null ? "تمت إعادة المعلم إلى السعر الافتراضي" : "تم حفظ السعر الخاص بالمعلم"); await fetchTeachers(); }
    setSaving(false);
  };

  const unifyInPersonRates = async () => {
    const rate = readInPersonRate(inPersonDefaultInput);
    if (rate === null) { toast.error("أدخل مبلغًا من 0 إلى 100 ر.س"); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc("admin_unify_in_person_teacher_rates" as any, {
      p_rate: rate, p_expected_count: inPersonTeachers.length,
    });
    if (error) toast.error("تعذر توحيد الأسعار؛ حدّث القائمة ثم حاول مجددًا");
    else {
      toast.success(`تم توحيد سعر ${Number(data) || 0} معلمًا. لم تتغير الحجوزات السابقة أو الطلبات المرسلة.`);
      setUnifyOpen(false);
      await fetchTeachers();
    }
    setSaving(false);
  };

  const applyGlobalRate = async () => {
    const rate = parseFloat(globalRate);
    if (isNaN(rate) || rate < 0) { toast.error("يرجى إدخال سعر صحيح"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("teacher_profiles")
      .update({ hourly_rate: rate })
      .eq("is_approved", true);
    if (error) { toast.error("حدث خطأ"); }
    else {
      toast.success(`تم تحديث سعر الحصة لجميع المعلمين إلى ${rate} ر.س`);
      await supabase.from("system_logs").insert({
        level: "info", source: "session_pricing",
        message: `تحديث سعر الحصة لجميع المعلمين إلى ${rate} ر.س`,
        metadata: { rate, scope: "all" },
      });
      fetchTeachers();
    }
    setSaving(false);
  };

  const applyIndividualRate = async () => {
    if (selectedTeacher === "all") { toast.error("اختر معلماً محدداً"); return; }
    const rate = parseFloat(individualRate);
    if (isNaN(rate) || rate < 0) { toast.error("يرجى إدخال سعر صحيح"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("teacher_profiles")
      .update({ hourly_rate: rate })
      .eq("user_id", selectedTeacher);
    if (error) { toast.error("حدث خطأ"); }
    else {
      const teacherName = teachers.find(t => t.user_id === selectedTeacher)?.full_name || "معلم";
      toast.success(`تم تحديث سعر الحصة لـ ${teacherName} إلى ${rate} ر.س`);
      await supabase.from("system_logs").insert({
        level: "info", source: "session_pricing",
        message: `تحديث سعر الحصة لـ ${teacherName} إلى ${rate} ر.س`,
        metadata: { rate, teacher_id: selectedTeacher, scope: "individual" },
      });
      await supabase.from("notifications").insert({
        user_id: selectedTeacher,
        title: "تحديث سعر الحصة 💰",
        body: `تم تحديث سعر حصتك إلى ${rate} ر.س بواسطة الإدارة.`,
        type: "general",
      });
      fetchTeachers();
    }
    setSaving(false);
  };

  const filteredTeachers = teachers.filter(t =>
    t.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <Card className="border-0 shadow-card">
        <CardContent className="p-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (activeMode === "in_person") {
    const selected = inPersonTeachers.find(t => t.teacher_id === inPersonTeacher);
    const filteredInPersonTeachers = inPersonTeachers.filter(t => t.full_name.toLowerCase().includes(searchQuery.toLowerCase()));
    return (
      <div className="space-y-4">
        <div className="flex gap-2" role="tablist" aria-label="نوع تسعير الحصص">
          <Button variant="outline" onClick={() => setActiveMode("online")}>الحصص الأونلاين</Button>
          <Button onClick={() => setActiveMode("in_person")} aria-selected="true" className="gap-2"><Home className="h-4 w-4" />الحصص الحضورية</Button>
        </div>
        <Card className="border-0 shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><DollarSign className="h-5 w-5 text-emerald-600" />تسعير الحصة الحضورية</CardTitle>
            <p className="text-sm text-muted-foreground">مدة التدريس {inPersonDuration} دقيقة · خصم الباقة يُضبط بشكل مستقل في الإعدادات المالية · تكلفة الطالب 100 ر.س. أجر المعلم يحدد أدناه وحصة المنصة هي المتبقي من 100 ر.س.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-muted/20 p-4">
              <div className="space-y-1">
                <label htmlFor="in-person-pricing-duration" className="text-sm font-medium">مدة التدريس الفعلية للحجوزات الجديدة (دقيقة)</label>
                <Input
                  id="in-person-pricing-duration"
                  type="number"
                  min={15}
                  max={180}
                  step={1}
                  value={inPersonDurationInput}
                  onChange={e => setInPersonDurationInput(e.target.value)}
                  className="w-36"
                />
              </div>
              <p className="pb-2 text-xs text-muted-foreground">من 15 إلى 180 دقيقة. لا تتغير مدة الحجوزات السابقة أو أرصدتها.</p>
              <Button onClick={saveInPersonDuration} disabled={saving || !durationSettingsId} className="gap-2"><Save className="h-4 w-4" />حفظ مدة الحصة</Button>
            </div>
            <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-muted/20 p-4">
              <div className="space-y-1"><label className="text-sm font-medium">أجر المعلم الافتراضي</label><Input type="number" min="0" max="100" step="0.01" value={inPersonDefaultInput} onChange={e => setInPersonDefaultInput(e.target.value)} className="w-36" /></div>
              <div className="pb-2 text-sm text-muted-foreground">ر.س للحصة · حصة المنصة الحالية {100 - inPersonDefault} ر.س</div>
              <Button onClick={saveInPersonDefault} disabled={saving} className="gap-2"><Save className="h-4 w-4" />حفظ الافتراضي</Button>
              <Button variant="destructive" onClick={() => setUnifyOpen(true)} disabled={saving} className="gap-2"><Users className="h-4 w-4" />توحيد السعر وإزالة الاستثناءات</Button>
            </div>
            <p className="text-xs text-muted-foreground">تحديث الافتراضي لا يغير أسعار المعلمين الخاصة، ولا يغير أي طلب أرسل أو حجز سابق.</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardHeader><CardTitle className="text-base">سعر خاص لمعلم</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1"><label className="text-sm font-medium">المعلم</label>
              <Select value={inPersonTeacher} onValueChange={value => {
                setInPersonTeacher(value);
                const teacher = inPersonTeachers.find(t => t.teacher_id === value);
                setInPersonRateInput(teacher?.override_rate_sar == null ? "" : String(teacher.override_rate_sar));
              }}>
                <SelectTrigger className="w-64"><SelectValue placeholder="اختر معلمًا..." /></SelectTrigger>
                <SelectContent>{inPersonTeachers.map(t => <SelectItem key={t.teacher_id} value={t.teacher_id}>{t.full_name} · {t.effective_rate_sar} ر.س</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><label className="text-sm font-medium">الأجر الخاص</label><Input type="number" min="0" max="100" step="0.01" value={inPersonRateInput} onChange={e => setInPersonRateInput(e.target.value)} className="w-36" placeholder="0–100" /></div>
            <Button onClick={() => saveInPersonTeacherRate(readInPersonRate(inPersonRateInput))} disabled={saving || !inPersonTeacher || !inPersonRateInput.trim()} className="gap-2"><Save className="h-4 w-4" />حفظ الاستثناء</Button>
            <Button variant="outline" onClick={() => saveInPersonTeacherRate(null)} disabled={saving || !inPersonTeacher || selected?.override_rate_sar == null} className="gap-2"><RotateCcw className="h-4 w-4" />العودة للافتراضي</Button>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-card">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">الأسعار الفعلية للمعلمين ({inPersonTeachers.length})</CardTitle>
            <Input placeholder="بحث بالاسم..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-48" />
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b text-right text-muted-foreground"><th className="p-2">المعلم</th><th className="p-2">أجر المعلم</th><th className="p-2">حصة المنصة</th><th className="p-2">مصدر السعر</th></tr></thead>
              <tbody>{filteredInPersonTeachers.map(t => <tr key={t.teacher_id} className="border-b">
                <td className="p-2 font-medium">{t.full_name}</td><td className="p-2">{t.effective_rate_sar} ر.س</td>
                <td className="p-2">{100 - Number(t.effective_rate_sar)} ر.س</td>
                <td className="p-2">{t.pricing_source === "custom" ? "سعر خاص" : "الافتراضي"}</td>
              </tr>)}</tbody>
            </table>
          </CardContent>
        </Card>
        <AlertDialog open={unifyOpen} onOpenChange={setUnifyOpen}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>توحيد سعر جميع المعلمين؟</AlertDialogTitle>
              <AlertDialogDescription>سيتم ضبط السعر الافتراضي على {inPersonDefaultInput || "—"} ر.س وإزالة الأسعار الخاصة عن {inPersonTeachers.length} معلمًا. الأسعار المثبتة في الطلبات المرسلة والحجوزات السابقة لا تتغير.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel disabled={saving}>إلغاء</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={event => { event.preventDefault(); void unifyInPersonRates(); }}>تأكيد التوحيد</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="tablist" aria-label="نوع تسعير الحصص">
        <Button onClick={() => setActiveMode("online")} aria-selected="true">الحصص الأونلاين</Button>
        <Button variant="outline" onClick={() => setActiveMode("in_person")} className="gap-2"><Home className="h-4 w-4" />الحصص الحضورية</Button>
      </div>
      {/* Global Rate */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            تحديث السعر لجميع المعلمين
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              placeholder="السعر بالريال..."
              value={globalRate}
              onChange={e => setGlobalRate(e.target.value)}
              className="w-40 rounded-xl"
              min="0"
            />
            <span className="text-sm text-muted-foreground">ر.س / ساعة</span>
            <Button onClick={applyGlobalRate} disabled={saving} className="rounded-xl gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              تطبيق على الجميع
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Individual Rate */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-secondary" />
            تحديث السعر لمعلم محدد
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={selectedTeacher} onValueChange={v => {
              setSelectedTeacher(v);
              const t = teachers.find(t => t.user_id === v);
              if (t) setIndividualRate(String(t.hourly_rate || 0));
            }}>
              <SelectTrigger className="w-60 rounded-xl">
                <SelectValue placeholder="اختر معلماً..." />
              </SelectTrigger>
              <SelectContent>
                {teachers.map(t => (
                  <SelectItem key={t.user_id} value={t.user_id}>
                    {t.full_name} ({t.hourly_rate} ر.س)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="السعر الجديد..."
              value={individualRate}
              onChange={e => setIndividualRate(e.target.value)}
              className="w-40 rounded-xl"
              min="0"
            />
            <span className="text-sm text-muted-foreground">ر.س / ساعة</span>
            <Button onClick={applyIndividualRate} disabled={saving || selectedTeacher === "all"} className="rounded-xl gap-1.5" variant="secondary">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Teachers List */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              أسعار المعلمين الحالية ({teachers.length})
            </CardTitle>
            <Input
              placeholder="بحث بالاسم..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-48 rounded-xl text-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-right pb-2 font-medium">المعلم</th>
                  <th className="text-right pb-2 font-medium">سعر الحصة</th>
                  <th className="text-right pb-2 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeachers.map(t => (
                  <tr key={t.user_id} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="py-2.5 font-bold text-foreground">{t.full_name}</td>
                    <td className="py-2.5">
                      <Badge className="bg-secondary/10 text-secondary border-0">{t.hourly_rate} ر.س/ساعة</Badge>
                    </td>
                    <td className="py-2.5">
                      <Badge variant="outline" className="text-[10px]">
                        {t.is_approved ? "✅ معتمد" : "⏳ معلق"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
