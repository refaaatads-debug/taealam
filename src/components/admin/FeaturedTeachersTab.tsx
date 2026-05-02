import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Star, Plus, Trash2, ArrowUp, ArrowDown, Search, Pencil, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FeaturedRow {
  id: string;
  teacher_id: string;
  badge_label: string;
  display_order: number;
  is_active: boolean;
  image_url?: string | null;
  subject_label?: string | null;
  price?: number | null;
  hide_price?: boolean;
  students_count?: number | null;
  sessions_count?: number | null;
  rating_override?: number | null;
  full_name?: string;
  avatar_url?: string;
  avg_rating?: number;
}

interface TeacherOption {
  user_id: string;
  full_name: string;
  avatar_url?: string;
  avg_rating?: number;
}

export default function FeaturedTeachersTab() {
  const [featured, setFeatured] = useState<FeaturedRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<FeaturedRow | null>(null);

  const load = async () => {
    setLoading(true);
    const [featRes, teachersRes] = await Promise.all([
      supabase.from("featured_teachers").select("*").order("display_order"),
      supabase.from("public_teacher_profiles").select("user_id, avg_rating").eq("is_approved", true),
    ]);

    const ids = (featRes.data ?? []).map((f: any) => f.teacher_id);
    const allIds = [...new Set([...ids, ...(teachersRes.data ?? []).map((t: any) => t.user_id)])];
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("user_id, full_name, avatar_url")
      .in("user_id", allIds);
    const profMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
    const ratingMap = new Map((teachersRes.data ?? []).map((t: any) => [t.user_id, t.avg_rating]));

    setFeatured(
      (featRes.data ?? []).map((f: any) => ({
        ...f,
        full_name: profMap.get(f.teacher_id)?.full_name || "—",
        avatar_url: profMap.get(f.teacher_id)?.avatar_url,
        avg_rating: ratingMap.get(f.teacher_id),
      }))
    );
    setTeachers(
      (teachersRes.data ?? [])
        .filter((t: any) => !ids.includes(t.user_id))
        .map((t: any) => ({
          user_id: t.user_id,
          full_name: profMap.get(t.user_id)?.full_name || "بدون اسم",
          avatar_url: profMap.get(t.user_id)?.avatar_url,
          avg_rating: t.avg_rating,
        }))
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addFeatured = async (teacher_id: string) => {
    const nextOrder = featured.length > 0 ? Math.max(...featured.map((f) => f.display_order)) + 1 : 0;
    const { error } = await supabase.from("featured_teachers").insert({
      teacher_id,
      badge_label: "مدرس مميز",
      display_order: nextOrder,
      is_active: true,
    });
    if (error) return toast.error("تعذّر الإضافة: " + error.message);
    toast.success("تمت الإضافة");
    load();
  };

  const removeFeatured = async (id: string) => {
    if (!confirm("إزالة هذا المدرس من القائمة المميزة؟")) return;
    const { error } = await supabase.from("featured_teachers").delete().eq("id", id);
    if (error) return toast.error("تعذّر الحذف");
    toast.success("تم الحذف");
    load();
  };

  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("featured_teachers").update({ is_active: active }).eq("id", id);
    if (error) toast.error("تعذّر التحديث"); else load();
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const target = featured[idx + dir];
    const current = featured[idx];
    if (!target || !current) return;
    await Promise.all([
      supabase.from("featured_teachers").update({ display_order: target.display_order }).eq("id", current.id),
      supabase.from("featured_teachers").update({ display_order: current.display_order }).eq("id", target.id),
    ]);
    load();
  };

  const filtered = teachers.filter((t) => t.full_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-gold" />
            المدرسون المميزون ({featured.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-8">جاري التحميل...</p>
          ) : featured.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">لا يوجد مدرسون مميزون. أضف من القائمة أدناه.</p>
          ) : (
            <div className="space-y-3">
              {featured.map((f, idx) => (
                <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 flex-wrap">
                  <div className="flex flex-col gap-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6" disabled={idx === 0} onClick={() => move(idx, -1)}>
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" disabled={idx === featured.length - 1} onClick={() => move(idx, 1)}>
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={f.image_url || f.avatar_url} />
                    <AvatarFallback>{f.full_name?.[0] || "؟"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-[150px]">
                    <p className="font-bold">{f.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.subject_label || "—"} · {f.hide_price ? "السعر مخفي" : `${f.price ?? "—"} ر.س`} · شارة: {f.badge_label}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={f.is_active} onCheckedChange={(v) => toggleActive(f.id, v)} />
                    <span className="text-xs text-muted-foreground">{f.is_active ? "ظاهر" : "مخفي"}</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditing(f)}>
                    <Pencil className="h-4 w-4 ml-1" /> تعديل
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => removeFeatured(f.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>إضافة مدرس للقائمة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم المدرس..." />
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">لا يوجد مدرسون متاحون</p>
            ) : (
              filtered.map((t) => (
                <div key={t.user_id} className="flex items-center gap-3 p-2 rounded-lg border hover:bg-muted/50">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={t.avatar_url} />
                    <AvatarFallback>{t.full_name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold">{t.full_name}</p>
                  </div>
                  <Button size="sm" onClick={() => addFeatured(t.user_id)}>
                    <Plus className="h-4 w-4 ml-1" /> إضافة
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <EditDialog row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </div>
  );
}

function EditDialog({ row, onClose, onSaved }: { row: FeaturedRow | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<FeaturedRow>>({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (row) {
      setForm({
        badge_label: row.badge_label,
        image_url: row.image_url ?? "",
        subject_label: row.subject_label ?? "",
        price: row.price ?? undefined,
        hide_price: row.hide_price ?? false,
        students_count: row.students_count ?? undefined,
        sessions_count: row.sessions_count ?? undefined,
        rating_override: row.rating_override ?? undefined,
      });
    }
  }, [row]);

  if (!row) return null;

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${row.teacher_id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("featured-teachers").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("featured-teachers").getPublicUrl(path);
      setForm((f) => ({ ...f, image_url: data.publicUrl }));
      toast.success("تم رفع الصورة");
    } catch (e: any) {
      toast.error("فشل رفع الصورة: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const { error } = await supabase
      .from("featured_teachers")
      .update({
        badge_label: form.badge_label || "مدرس مميز",
        image_url: form.image_url || null,
        subject_label: form.subject_label || null,
        price: form.price === undefined || form.price === null || (form.price as any) === "" ? null : Number(form.price),
        hide_price: !!form.hide_price,
        students_count: form.students_count === undefined || (form.students_count as any) === "" ? null : Number(form.students_count),
        sessions_count: form.sessions_count === undefined || (form.sessions_count as any) === "" ? null : Number(form.sessions_count),
        rating_override: form.rating_override === undefined || (form.rating_override as any) === "" ? null : Number(form.rating_override),
      })
      .eq("id", row.id);
    if (error) return toast.error("تعذّر الحفظ: " + error.message);
    toast.success("تم الحفظ");
    onSaved();
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل بيانات: {row.full_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>الصورة</Label>
            <div className="flex items-center gap-3 mt-1">
              <Avatar className="h-20 w-20 rounded-xl">
                <AvatarImage src={form.image_url || row.avatar_url} className="object-cover" />
                <AvatarFallback className="rounded-xl">{row.full_name?.[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <Input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                />
                <Input
                  placeholder="أو الصق رابط صورة"
                  value={form.image_url || ""}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                />
                {form.image_url && (
                  <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, image_url: "" })}>
                    إزالة الصورة المخصصة
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>نص الشارة</Label>
              <Input value={form.badge_label || ""} onChange={(e) => setForm({ ...form, badge_label: e.target.value })} placeholder="مدرس مميز" />
            </div>
            <div>
              <Label>المادة</Label>
              <Input value={form.subject_label || ""} onChange={(e) => setForm({ ...form, subject_label: e.target.value })} placeholder="رياضيات" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>السعر (ر.س/ساعة)</Label>
              <Input
                type="number"
                value={form.price ?? ""}
                onChange={(e) => setForm({ ...form, price: e.target.value === "" ? undefined : Number(e.target.value) })}
                placeholder="80"
              />
            </div>
            <div>
              <Label>التقييم (0-5)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={form.rating_override ?? ""}
                onChange={(e) => setForm({ ...form, rating_override: e.target.value === "" ? undefined : Number(e.target.value) })}
                placeholder="4.9"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg border">
            <Switch checked={!!form.hide_price} onCheckedChange={(v) => setForm({ ...form, hide_price: v })} />
            <Label>إخفاء السعر في البطاقة</Label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>عدد الطلاب</Label>
              <Input
                type="number"
                value={form.students_count ?? ""}
                onChange={(e) => setForm({ ...form, students_count: e.target.value === "" ? undefined : Number(e.target.value) })}
                placeholder="320"
              />
            </div>
            <div>
              <Label>عدد الحصص</Label>
              <Input
                type="number"
                value={form.sessions_count ?? ""}
                onChange={(e) => setForm({ ...form, sessions_count: e.target.value === "" ? undefined : Number(e.target.value) })}
                placeholder="1200"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button onClick={save} disabled={uploading}>
              <Upload className="h-4 w-4 ml-1" /> حفظ التغييرات
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
