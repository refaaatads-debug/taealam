import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Save, Trash2, Loader2, Crown, Star, Sparkles, Edit, User, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Plan {
  id: string;
  name_ar: string;
  tier: string;
  price: number;
  sessions_count: number;
  session_duration_minutes: number;
  has_ai_tutor: boolean;
  has_recording: boolean;
  has_priority_booking: boolean;
  features: string[];
  assigned_user_id: string | null;
}

interface StudentProfile {
  user_id: string;
  full_name: string;
}

const tierIcons: Record<string, typeof Star> = { basic: Star, standard: Sparkles, premium: Crown };

const PlansManagementTab = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Plan>>({});
  const [showNewForm, setShowNewForm] = useState(false);
  const [newPlan, setNewPlan] = useState<Partial<Plan>>({
    name_ar: "", tier: "basic", price: 0, sessions_count: 4,
    has_ai_tutor: false, has_recording: false, has_priority_booking: false,
    features: [], assigned_user_id: null, session_duration_minutes: 45,
  });
  const [newFeature, setNewFeature] = useState("");
  const [editFeature, setEditFeature] = useState("");
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchPlans();
    fetchStudents();
  }, []);

  const fetchPlans = async () => {
    const { data } = await supabase.from("subscription_plans").select("*").order("price");
    if (data) {
      setPlans(data as Plan[]);
      // Fetch names for assigned students
      const assignedIds = data.filter(p => p.assigned_user_id).map(p => p.assigned_user_id);
      if (assignedIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", assignedIds);
        if (profiles) {
          const map: Record<string, string> = {};
          profiles.forEach(p => { map[p.user_id] = p.full_name; });
          setStudentNames(prev => ({ ...prev, ...map }));
        }
      }
    }
    setLoading(false);
  };

  const fetchStudents = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "student");
    if (roles && roles.length > 0) {
      const ids = roles.map(r => r.user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
      if (profiles) {
        setStudents(profiles);
        const map: Record<string, string> = {};
        profiles.forEach(p => { map[p.user_id] = p.full_name; });
        setStudentNames(prev => ({ ...prev, ...map }));
      }
    }
  };

  const startEdit = (plan: Plan) => {
    setEditingPlan(plan.id);
    setEditData({ ...plan });
  };

  const cancelEdit = () => {
    setEditingPlan(null);
    setEditData({});
  };

  const savePlan = async (planId: string) => {
    setSaving(planId);
    const { error } = await supabase
      .from("subscription_plans")
      .update({
        name_ar: editData.name_ar,
        price: editData.price,
        sessions_count: editData.sessions_count,
        session_duration_minutes: editData.session_duration_minutes || 45,
        has_ai_tutor: editData.has_ai_tutor,
        has_recording: editData.has_recording,
        has_priority_booking: editData.has_priority_booking,
        features: editData.features as any,
        assigned_user_id: editData.assigned_user_id || null,
      })
      .eq("id", planId);
    if (error) {
      toast.error("خطأ في الحفظ: " + error.message);
    } else {
      toast.success("تم تحديث الباقة بنجاح");
      setEditingPlan(null);
      fetchPlans();
    }
    setSaving(null);
  };

  const createPlan = async () => {
    setSaving("new");
    const { error } = await supabase.from("subscription_plans").insert({
      name_ar: newPlan.name_ar!,
      tier: newPlan.tier as any,
      price: newPlan.price!,
      sessions_count: newPlan.sessions_count!,
      session_duration_minutes: newPlan.session_duration_minutes || 45,
      has_ai_tutor: newPlan.has_ai_tutor,
      has_recording: newPlan.has_recording,
      has_priority_booking: newPlan.has_priority_booking,
      features: newPlan.features as any,
      assigned_user_id: newPlan.assigned_user_id || null,
    });
    if (error) {
      toast.error("خطأ في الإنشاء: " + error.message);
    } else {
      toast.success("تم إنشاء الباقة بنجاح");
      setShowNewForm(false);
      setNewPlan({ name_ar: "", tier: "basic", price: 0, sessions_count: 4, has_ai_tutor: false, has_recording: false, has_priority_booking: false, features: [], assigned_user_id: null, session_duration_minutes: 45 });
      fetchPlans();
    }
    setSaving(null);
  };

  const deletePlan = async (planId: string) => {
    if (!window.confirm("هل أنت متأكد من حذف هذه الباقة؟")) return;
    const { error } = await supabase.from("subscription_plans").delete().eq("id", planId);
    if (error) {
      toast.error("خطأ في الحذف: " + error.message);
    } else {
      toast.success("تم حذف الباقة");
      fetchPlans();
    }
  };

  const StudentSelector = ({ value, onChange }: { value: string | null | undefined; onChange: (v: string | null) => void }) => (
    <div className="flex items-center gap-2">
      <Select value={value || "all"} onValueChange={v => onChange(v === "all" ? null : v)}>
        <SelectTrigger className="rounded-lg text-sm">
          <SelectValue placeholder="جميع الطلاب" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">جميع الطلاب (عامة)</SelectItem>
          {students.map(s => (
            <SelectItem key={s.user_id} value={s.user_id}>
              {s.full_name || "طالب بدون اسم"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && (
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={() => onChange(null)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">إدارة الباقات ({plans.length})</h3>
        <Button size="sm" className="rounded-lg gap-1.5" onClick={() => setShowNewForm(!showNewForm)}>
          <Plus className="h-4 w-4" />
          إضافة باقة
        </Button>
      </div>

      {showNewForm && (
        <Card className="border-2 border-dashed border-primary/30 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold">باقة جديدة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Input placeholder="اسم الباقة" value={newPlan.name_ar} onChange={e => setNewPlan(p => ({ ...p, name_ar: e.target.value }))} className="rounded-lg text-sm" />
              <Select value={newPlan.tier} onValueChange={v => setNewPlan(p => ({ ...p, tier: v }))}>
                <SelectTrigger className="rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">مجانية</SelectItem>
                  <SelectItem value="basic">أساسية</SelectItem>
                  <SelectItem value="standard">متقدمة</SelectItem>
                  <SelectItem value="premium">احترافية</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" placeholder="السعر" value={newPlan.price || ""} onChange={e => setNewPlan(p => ({ ...p, price: Number(e.target.value) }))} className="rounded-lg text-sm" />
              <Input type="number" placeholder="عدد الحصص" value={newPlan.sessions_count || ""} onChange={e => setNewPlan(p => ({ ...p, sessions_count: Number(e.target.value) }))} className="rounded-lg text-sm" />
            </div>
            {newPlan.tier === "free" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">مدة الحصة المجانية (بالدقائق)</label>
                <Input type="number" placeholder="45" value={newPlan.session_duration_minutes || ""} onChange={e => setNewPlan(p => ({ ...p, session_duration_minutes: Number(e.target.value) }))} className="rounded-lg text-sm w-48" />
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">تخصيص لطالب محدد (اختياري)</label>
              <StudentSelector value={newPlan.assigned_user_id} onChange={v => setNewPlan(p => ({ ...p, assigned_user_id: v }))} />
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={newPlan.has_ai_tutor} onCheckedChange={v => setNewPlan(p => ({ ...p, has_ai_tutor: v }))} />
                مدرس AI
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={newPlan.has_recording} onCheckedChange={v => setNewPlan(p => ({ ...p, has_recording: v }))} />
                تسجيل الحصص
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={newPlan.has_priority_booking} onCheckedChange={v => setNewPlan(p => ({ ...p, has_priority_booking: v }))} />
                أولوية الحجز
              </label>
            </div>
            <div className="flex gap-2">
              <Input placeholder="أضف ميزة..." value={newFeature} onChange={e => setNewFeature(e.target.value)} className="rounded-lg text-sm" />
              <Button size="sm" variant="outline" className="rounded-lg shrink-0" onClick={() => {
                if (newFeature.trim()) {
                  setNewPlan(p => ({ ...p, features: [...(p.features || []), newFeature.trim()] }));
                  setNewFeature("");
                }
              }}>إضافة</Button>
            </div>
            {(newPlan.features || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(newPlan.features || []).map((f, i) => (
                  <Badge key={i} variant="secondary" className="text-xs cursor-pointer" onClick={() => setNewPlan(p => ({ ...p, features: p.features?.filter((_, j) => j !== i) }))}>
                    {f} ✕
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" className="rounded-lg gap-1.5" disabled={saving === "new" || !newPlan.name_ar} onClick={createPlan}>
                {saving === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                إنشاء
              </Button>
              <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => setShowNewForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {plans.map(plan => {
        const Icon = tierIcons[plan.tier] || Star;
        const isEditing = editingPlan === plan.id;
        
        return (
          <Card key={plan.id} className="border-0 shadow-card">
            <CardContent className="p-4">
              {isEditing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Input value={editData.name_ar} onChange={e => setEditData(d => ({ ...d, name_ar: e.target.value }))} className="rounded-lg text-sm" />
                    <Input type="number" value={editData.price || ""} onChange={e => setEditData(d => ({ ...d, price: Number(e.target.value) }))} className="rounded-lg text-sm" placeholder="السعر" />
                    <Input type="number" value={editData.sessions_count || ""} onChange={e => setEditData(d => ({ ...d, sessions_count: Number(e.target.value) }))} className="rounded-lg text-sm" placeholder="عدد الحصص" />
                  </div>
                  {plan.tier === "free" && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">مدة الحصة المجانية (بالدقائق)</label>
                      <Input type="number" value={editData.session_duration_minutes || ""} onChange={e => setEditData(d => ({ ...d, session_duration_minutes: Number(e.target.value) }))} className="rounded-lg text-sm w-48" placeholder="45" />
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">تخصيص لطالب محدد</label>
                    <StudentSelector value={editData.assigned_user_id} onChange={v => setEditData(d => ({ ...d, assigned_user_id: v }))} />
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={editData.has_ai_tutor} onCheckedChange={v => setEditData(d => ({ ...d, has_ai_tutor: v }))} />
                      مدرس AI
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={editData.has_recording} onCheckedChange={v => setEditData(d => ({ ...d, has_recording: v }))} />
                      تسجيل
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={editData.has_priority_booking} onCheckedChange={v => setEditData(d => ({ ...d, has_priority_booking: v }))} />
                      أولوية
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder="أضف ميزة..." value={editFeature} onChange={e => setEditFeature(e.target.value)} className="rounded-lg text-sm" />
                    <Button size="sm" variant="outline" className="rounded-lg shrink-0" onClick={() => {
                      if (editFeature.trim()) {
                        setEditData(d => ({ ...d, features: [...(d.features || []), editFeature.trim()] }));
                        setEditFeature("");
                      }
                    }}>إضافة</Button>
                  </div>
                  {(editData.features || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {(editData.features || []).map((f, i) => (
                        <Badge key={i} variant="secondary" className="text-xs cursor-pointer" onClick={() => setEditData(d => ({ ...d, features: d.features?.filter((_, j) => j !== i) }))}>
                          {f} ✕
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" className="rounded-lg gap-1.5" disabled={saving === plan.id} onClick={() => savePlan(plan.id)}>
                      {saving === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      حفظ
                    </Button>
                    <Button size="sm" variant="ghost" className="rounded-lg" onClick={cancelEdit}>إلغاء</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-foreground text-sm">{plan.name_ar}</p>
                        {plan.assigned_user_id && (
                          <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/50 text-amber-600">
                            <User className="h-2.5 w-2.5" />
                            {studentNames[plan.assigned_user_id] || "طالب مخصص"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {plan.price} ر.س • {plan.sessions_count} حصة
                        {plan.tier === "free" && plan.session_duration_minutes ? ` • ${plan.session_duration_minutes} دقيقة` : ""}
                        {plan.has_ai_tutor && " • AI"}
                        {plan.has_recording && " • تسجيل"}
                        {plan.has_priority_booking && " • أولوية"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {(plan.features as string[])?.length > 0 && (
                      <div className="hidden md:flex flex-wrap gap-1">
                        {(plan.features as string[]).slice(0, 3).map((f, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">{f}</Badge>
                        ))}
                        {(plan.features as string[]).length > 3 && (
                          <Badge variant="outline" className="text-[10px]">+{(plan.features as string[]).length - 3}</Badge>
                        )}
                      </div>
                    )}
                    <Badge variant="secondary" className="text-xs">{plan.tier}</Badge>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => startEdit(plan)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => deletePlan(plan.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default PlansManagementTab;
