import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Users, Loader2, Save, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function SessionPricingTab() {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [globalRate, setGlobalRate] = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState("all");
  const [individualRate, setIndividualRate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

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
    setLoading(false);
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

  return (
    <div className="space-y-4">
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
