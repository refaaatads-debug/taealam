import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { validateLearningMaterialDraft } from "@/lib/learningMaterialLinks";
import { toast } from "sonner";
import { BookOpen, ExternalLink, FilePlus2, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";

type MaterialLink = Database["public"]["Tables"]["learning_material_links"]["Row"];
type Draft = { name: string; description: string; url: string };
const EMPTY_DRAFT: Draft = { name: "", description: "", url: "" };

interface LearningMaterialsSectionProps {
  canManage?: boolean;
}

export default function LearningMaterialsSection({ canManage = false }: LearningMaterialsSectionProps) {
  const [links, setLinks] = useState<MaterialLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MaterialLink | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      let query = supabase.from("learning_material_links").select("*")
        .order("sort_order", { ascending: true }).order("created_at", { ascending: true });
      if (!canManage) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      setLinks(data || []);
    } catch {
      setLinks([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => { void loadLinks(); }, [loadLinks]);

  const startAdd = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setDialogOpen(true);
  };

  const startEdit = (link: MaterialLink) => {
    setEditingId(link.id);
    setDraft({ name: link.name, description: link.description, url: link.url });
    setDialogOpen(true);
  };

  const saveLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage || saving) return;

    let validDraft: Draft;
    try {
      validDraft = validateLearningMaterialDraft(draft);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تحقق من بيانات الرابط.");
      return;
    }

    setSaving(true);
    try {
      const result = editingId
        ? await supabase.from("learning_material_links").update(validDraft).eq("id", editingId)
        : await supabase.from("learning_material_links").insert({
            ...validDraft,
            sort_order: links.reduce((max, link) => Math.max(max, link.sort_order), 0) + 1,
          });
      if (result.error) throw result.error;
      toast.success(editingId ? "تم تحديث الرابط." : "تمت إضافة الرابط.");
      setDialogOpen(false);
      setDraft(EMPTY_DRAFT);
      setEditingId(null);
      await loadLinks();
    } catch {
      toast.error("تعذر حفظ الرابط. تأكد من عدم تكراره ثم حاول مجددًا.");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (link: MaterialLink, isActive: boolean) => {
    if (!canManage || busyId) return;
    setBusyId(link.id);
    try {
      const { error } = await supabase.from("learning_material_links").update({ is_active: isActive }).eq("id", link.id);
      if (error) throw error;
      toast.success(isActive ? "أصبح الرابط ظاهرًا للمعلمين." : "أُخفي الرابط عن المعلمين.");
      await loadLinks();
    } catch {
      toast.error("تعذر تحديث حالة الرابط.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteLink = async () => {
    if (!canManage || !deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("learning_material_links").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("تم حذف الرابط.");
      setDeleteTarget(null);
      await loadLinks();
    } catch {
      toast.error("تعذر حذف الرابط.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section dir="rtl" className="mx-auto w-full max-w-6xl space-y-6">
      <header className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-l from-white via-white to-emerald-50 p-6 shadow-sm sm:p-8">
        <div className="absolute -left-8 -top-12 h-40 w-40 rounded-full bg-emerald-100/60 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-700">مصادر المعلم</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">جهّز المادة العلمية</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                روابط الكتب والمصادر التي تساعدك على تجهيز الدرس ومراجعة المنهج.
              </p>
            </div>
          </div>
          {canManage && (
            <Button onClick={startAdd} className="shrink-0 gap-2 rounded-xl">
              <FilePlus2 className="h-4 w-4" /> إضافة رابط
            </Button>
          )}
        </div>
        {!loading && !loadFailed && (
          <div className="relative mt-5 flex items-center gap-2 text-xs text-slate-500">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {canManage
              ? `${links.filter((link) => link.is_active).length} رابطًا مفعّلًا للمعلمين`
              : `${links.length} مصدرًا متاحًا`}
            {canManage && ` · ${links.length} إجمالًا`}
          </div>
        )}
      </header>

      {loadFailed ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <BookOpen className="h-9 w-9 text-muted-foreground" />
            <p className="font-bold">تعذر تحميل روابط تجهيز المادة العلمية.</p>
            <Button variant="outline" onClick={() => void loadLinks()} className="gap-2">
              <RefreshCw className="h-4 w-4" /> إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="جاري تحميل الروابط">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-44 animate-pulse rounded-2xl border bg-white" />
          ))}
        </div>
      ) : links.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <BookOpen className="h-9 w-9 text-muted-foreground" />
            <p className="font-bold">{canManage ? "أضف أول مصدر للمادة العلمية." : "لا توجد روابط مفعّلة الآن."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {links.map((link, index) => {
            let hostname = link.url;
            try { hostname = new URL(link.url).hostname; } catch { /* A malformed URL cannot be navigated to safely. */ }
            const [category, ...titleParts] = link.name.split(/\s[-–—]\s/);
            const displayTitle = titleParts.length ? titleParts.join(" - ") : category;
            return (
              <Card key={link.id} className={`group overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg ${!link.is_active ? "opacity-70" : ""}`}>
                <CardContent className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <Badge variant="secondary" className="mb-2 bg-emerald-50 text-[10px] text-emerald-800 hover:bg-emerald-50">
                          {titleParts.length ? category : "مصدر تعليمي"}
                        </Badge>
                        <h3 className="break-words text-base font-black leading-6 text-slate-900">{displayTitle}</h3>
                      </div>
                    </div>
                    {canManage && (
                      <Badge variant={link.is_active ? "default" : "outline"} className="shrink-0">
                        {link.is_active ? "ظاهر" : "مخفي"}
                      </Badge>
                    )}
                    {!canManage && <span className="text-xs font-medium text-slate-400">{String(index + 1).padStart(2, "0")}</span>}
                  </div>

                  <p className="mt-4 min-h-12 text-sm leading-6 text-slate-600">{link.description}</p>
                  <p className="mt-2 truncate text-xs text-slate-400" dir="ltr">{hostname}</p>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <Button asChild size="sm" className="gap-2 rounded-xl">
                      <a href={link.url} target="_blank" rel="noopener noreferrer">
                        فتح المصدر <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Switch
                            id={`material-active-${link.id}`}
                            checked={link.is_active}
                            disabled={busyId === link.id}
                            onCheckedChange={(checked) => void setActive(link, checked)}
                          />
                          <Label htmlFor={`material-active-${link.id}`}>إظهار</Label>
                        </div>
                        <Button variant="ghost" size="icon" aria-label={`تعديل ${link.name}`} onClick={() => startEdit(link)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`حذف ${link.name}`} onClick={() => setDeleteTarget(link)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {canManage && (
        <>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent dir="rtl" className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>{editingId ? "تعديل رابط المادة العلمية" : "إضافة رابط للمادة العلمية"}</DialogTitle>
                <DialogDescription>أدخل الاسم والوصف والرابط الآمن ليظهر المصدر المفعّل في حساب المعلم.</DialogDescription>
              </DialogHeader>
              <form onSubmit={(event) => void saveLink(event)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="learning-material-name">اسم الرابط</Label>
                  <Input id="learning-material-name" value={draft.name} maxLength={120} required
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="الكتب المدرسية - منهجي" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="learning-material-description">وصف الرابط</Label>
                  <Textarea id="learning-material-description" value={draft.description} maxLength={500} required
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="اكتب وصفًا مختصرًا للمصدر" rows={3} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="learning-material-url">الرابط</Label>
                  <Input id="learning-material-url" value={draft.url} type="url" dir="ltr" maxLength={2048} required
                    onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://example.com" />
                  <p className="text-xs text-muted-foreground">تُقبل روابط HTTPS فقط.</p>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
                  <Button type="submit" disabled={saving} className="gap-2">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {editingId ? "حفظ التعديلات" : "إضافة الرابط"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>حذف رابط المادة العلمية؟</AlertDialogTitle>
                <AlertDialogDescription>سيُحذف «{deleteTarget?.name}» من قائمة المعلمين. لا يمكن التراجع عن الحذف.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
                <AlertDialogAction disabled={deleting} onClick={(event) => { event.preventDefault(); void deleteLink(); }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "حذف الرابط"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </section>
  );
}
