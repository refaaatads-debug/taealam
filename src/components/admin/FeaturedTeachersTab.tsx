import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, Plus, Trash2, ArrowUp, ArrowDown, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FeaturedRow {
  id: string;
  teacher_id: string;
  badge_label: string;
  display_order: number;
  is_active: boolean;
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
  const [newBadge, setNewBadge] = useState("مدرس مميز");

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

  useEffect(() => {
    load();
  }, []);

  const addFeatured = async (teacher_id: string) => {
    const nextOrder = featured.length > 0 ? Math.max(...featured.map((f) => f.display_order)) + 1 : 0;
    const { error } = await supabase.from("featured_teachers").insert({
      teacher_id,
      badge_label: newBadge || "مدرس مميز",
      display_order: nextOrder,
      is_active: true,
    });
    if (error) {
      toast.error("تعذّر الإضافة: " + error.message);
      return;
    }
    toast.success("تم إضافة المدرس للقائمة المميزة");
    load();
  };

  const removeFeatured = async (id: string) => {
    if (!confirm("هل أنت متأكد من إزالة هذا المدرس من القائمة المميزة؟")) return;
    const { error } = await supabase.from("featured_teachers").delete().eq("id", id);
    if (error) {
      toast.error("تعذّر الحذف");
      return;
    }
    toast.success("تم الحذف");
    load();
  };

  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("featured_teachers").update({ is_active: active }).eq("id", id);
    if (error) toast.error("تعذّر التحديث");
    else load();
  };

  const updateBadge = async (id: string, badge_label: string) => {
    const { error } = await supabase.from("featured_teachers").update({ badge_label }).eq("id", id);
    if (error) toast.error("تعذّر التحديث");
    else load();
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
                <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <div className="flex flex-col gap-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6" disabled={idx === 0} onClick={() => move(idx, -1)}>
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" disabled={idx === featured.length - 1} onClick={() => move(idx, 1)}>
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={f.avatar_url} />
                    <AvatarFallback>{f.full_name?.[0] || "؟"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-bold">{f.full_name}</p>
                    {f.avg_rating != null && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Star className="h-3 w-3 fill-gold text-gold" />
                        {Number(f.avg_rating).toFixed(1)}
                      </p>
                    )}
                  </div>
                  <Input
                    className="w-40"
                    defaultValue={f.badge_label}
                    onBlur={(e) => e.target.value !== f.badge_label && updateBadge(f.id, e.target.value)}
                    placeholder="نص الشارة"
                  />
                  <div className="flex items-center gap-2">
                    <Switch checked={f.is_active} onCheckedChange={(v) => toggleActive(f.id, v)} />
                    <span className="text-xs text-muted-foreground">{f.is_active ? "ظاهر" : "مخفي"}</span>
                  </div>
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
          <CardTitle>إضافة مدرس للقائمة المميزة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>نص الشارة الافتراضي</Label>
              <Input value={newBadge} onChange={(e) => setNewBadge(e.target.value)} placeholder="مدرس مميز" />
            </div>
            <div>
              <Label>بحث عن مدرس</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pr-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="اسم المدرس..."
                />
              </div>
            </div>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">لا يوجد مدرسون متاحون للإضافة</p>
            ) : (
              filtered.map((t) => (
                <div key={t.user_id} className="flex items-center gap-3 p-2 rounded-lg border hover:bg-muted/50">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={t.avatar_url} />
                    <AvatarFallback>{t.full_name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold">{t.full_name}</p>
                    {t.avg_rating != null && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Star className="h-3 w-3 fill-gold text-gold" />
                        {Number(t.avg_rating).toFixed(1)}
                      </p>
                    )}
                  </div>
                  <Button size="sm" onClick={() => addFeatured(t.user_id)}>
                    <Plus className="h-4 w-4 ml-1" />
                    إضافة
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
