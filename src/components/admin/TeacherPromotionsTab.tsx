import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Megaphone, Plus, Trash2, ArrowUp, ArrowDown, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { safeErrorMessage } from "@/lib/safeErrorMessage";

type Mode = "online" | "in_person";
const MAX_ACTIVE = 10;

interface PromoRow {
  id: string;
  teacher_id: string;
  mode: Mode;
  display_order: number;
  is_active: boolean;
  starts_at: string;
  ends_at: string | null;
  full_name?: string;
}

interface TeacherOption { user_id: string; full_name: string }

const MODE_TITLES: Record<Mode, string> = {
  online: "إعلانات المعلمين: الحصص أونلاين",
  in_person: "إعلانات المعلمين: الحصص الحضورية",
};

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

function PromotionList({ mode, rows, teachers, onChange }: { mode: Mode; rows: PromoRow[]; teachers: TeacherOption[]; onChange: () => void }) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const activeCount = rows.filter((r) => r.is_active).length;
  const taken = new Set(rows.map((r) => r.teacher_id));
  const options = teachers
    .filter((t) => !taken.has(t.user_id) && t.full_name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 8);

  const add = async (teacherId: string) => {
    if (activeCount >= MAX_ACTIVE) return toast.error(`الحد الأقصى ${MAX_ACTIVE} معلمين في هذه القائمة`);
    const nextOrder = rows.length ? Math.max(...rows.map((r) => r.display_order)) + 1 : 0;
    const { error } = await (supabase as any).from("teacher_promotions").insert({
      teacher_id: teacherId, mode, display_order: nextOrder, is_active: true, created_by: user?.id ?? null,
    });
    if (error) return toast.error(safeErrorMessage(error, "تعذرت إضافة الإعلان. حاول مرة أخرى."));
    toast.success("تمت الإضافة");
    setSearch("");
    onChange();
  };

  const toggle = async (row: PromoRow, active: boolean) => {
    if (active && activeCount >= MAX_ACTIVE) return toast.error(`الحد الأقصى ${MAX_ACTIVE} معلمين نشطين`);
    const { error } = await (supabase as any).from("teacher_promotions").update({ is_active: active }).eq("id", row.id);
    if (error) toast.error(safeErrorMessage(error, "تعذّر التحديث")); else onChange();
  };

  const setEnd = async (row: PromoRow, value: string) => {
    const ends_at = value ? new Date(`${value}T23:59:59`).toISOString() : null;
    const { error } = await (supabase as any).from("teacher_promotions").update({ ends_at }).eq("id", row.id);
    if (error) toast.error(safeErrorMessage(error, "تعذّر حفظ تاريخ الانتهاء")); else onChange();
  };

  const remove = async (row: PromoRow) => {
    if (!confirm("إزالة هذا الإعلان؟")) return;
    const { error } = await (supabase as any).from("teacher_promotions").delete().eq("id", row.id);
    if (error) toast.error("تعذّر الحذف"); else { toast.success("تم الحذف"); onChange(); }
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const a = rows[idx], b = rows[idx + dir];
    if (!a || !b) return;
    const orderA = a.display_order, orderB = b.display_order === a.display_order ? a.display_order + dir : b.display_order;
    await Promise.all([
      (supabase as any).from("teacher_promotions").update({ display_order: orderB }).eq("id", a.id),
      (supabase as any).from("teacher_promotions").update({ display_order: orderA }).eq("id", b.id),
    ]);
    onChange();
  };

  const now = Date.now();
  const statusOf = (r: PromoRow) => {
    if (!r.is_active) return "متوقف";
    if (new Date(r.starts_at).getTime() > now) return "لم يبدأ";
    if (r.ends_at && new Date(r.ends_at).getTime() <= now) return "منتهي";
    return "ظاهر الآن";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-gold" />
          {MODE_TITLES[mode]}
          <span className="text-sm font-normal text-muted-foreground">({activeCount}/{MAX_ACTIVE} نشط)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">لا يوجد معلمون معلن عنهم في هذه القائمة.</p>}
          {rows.map((r, i) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
              <span className="w-6 text-center text-sm font-bold text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{r.full_name || "—"}</p>
                <p className="text-xs text-muted-foreground">{statusOf(r)}</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                ينتهي في
                <Input type="date" className="h-8 w-36" value={toDateInput(r.ends_at)} onChange={(e) => setEnd(r, e.target.value)} />
              </label>
              <Switch checked={r.is_active} onCheckedChange={(v) => toggle(r, v)} />
              <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-xl bg-muted/40 p-3">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pr-9" placeholder="ابحث عن معلم لإضافته" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {search && options.length === 0 && <p className="text-xs text-muted-foreground">لا توجد نتائج.</p>}
          {search && options.map((t) => (
            <div key={t.user_id} className="flex items-center justify-between rounded-lg bg-background p-2">
              <span className="font-medium">{t.full_name}</span>
              <Button size="sm" disabled={activeCount >= MAX_ACTIVE} onClick={() => add(t.user_id)}>
                <Plus className="ml-1 h-4 w-4" />إضافة
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function TeacherPromotionsTab() {
  const [rows, setRows] = useState<PromoRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);

  const load = async () => {
    const [promoRes, tRes] = await Promise.all([
      (supabase as any).from("teacher_promotions").select("*").order("display_order"),
      supabase.from("public_teacher_profiles").select("user_id").eq("is_approved", true),
    ]);
    if (promoRes.error) { setMissingTable(true); setLoading(false); return; }
    const ids = [...new Set([...(promoRes.data ?? []).map((r: any) => r.teacher_id), ...(tRes.data ?? []).map((t: any) => t.user_id)])] as string[];
    const { data: profiles } = ids.length
      ? await supabase.from("public_profiles").select("user_id, full_name").in("user_id", ids)
      : { data: [] as any[] };
    const names = new Map((profiles ?? []).map((p: any) => [p.user_id, p.full_name || "بدون اسم"]));
    setRows((promoRes.data ?? []).map((r: any) => ({ ...r, full_name: names.get(r.teacher_id) })));
    setTeachers((tRes.data ?? []).map((t: any) => ({ user_id: t.user_id, full_name: names.get(t.user_id) || "بدون اسم" })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <p className="p-6 text-muted-foreground">جارٍ التحميل...</p>;
  if (missingTable) return <p className="p-6 text-muted-foreground">قسم الإعلانات غير مفعّل بعد على قاعدة البيانات.</p>;

  return (
    <div className="space-y-6" dir="rtl">
      <p className="text-sm text-muted-foreground">
        المعلمون المضافون هنا يظهرون أولاً في نتائج بحث الطلاب مع علامة «إعلان». القائمتان منفصلتان (أونلاين وحضوري)، حتى {MAX_ACTIVE} معلمين نشطين في كل قائمة.
      </p>
      <PromotionList mode="online" rows={rows.filter((r) => r.mode === "online")} teachers={teachers} onChange={load} />
      <PromotionList mode="in_person" rows={rows.filter((r) => r.mode === "in_person")} teachers={teachers} onChange={load} />
    </div>
  );
}
