import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, EyeOff, ShieldCheck, AlertTriangle, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/auditLog";

export type PermDef = { key: string; label: string; group: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member: { user_id: string; full_name: string; permissions: string[]; is_full_admin: boolean } | null;
  allPermissions: PermDef[];
  /** caller can see/grant manage_admins */
  canGrantManageAdmins: boolean;
  onSaved: () => void;
}

// Impact descriptions: what each permission visually unlocks for the user
const IMPACT_DESCRIPTIONS: Record<string, string> = {
  view_overview: "يرى صفحة النظرة العامة وإحصائيات المنصة",
  view_reports: "يرى التقارير العامة والمخططات البيانية",
  view_teacher_performance: "يرى مؤشرات أداء المعلمين",
  manage_users: "إضافة/تعديل/حذف بيانات المستخدمين",
  manage_teachers: "اعتماد، رفض، وتعديل ملفات المعلمين",
  manage_bookings: "تعديل وإلغاء الحجوزات",
  manage_session_reports: "الاطلاع على وتعديل تقارير الحصص",
  manage_session_pricing: "تعديل أسعار الحصص الفردية",
  manage_materials: "إدارة المواد التعليمية والتسجيلات",
  manage_plans: "تعديل خطط الاشتراك",
  manage_coupons: "إنشاء وإلغاء الكوبونات والخصومات",
  manage_content: "تعديل محتوى الموقع (CMS)",
  manage_notifications: "إرسال إشعارات للمستخدمين",
  manage_payments: "الاطلاع وإدارة سجل المدفوعات",
  manage_withdrawals: "الموافقة على/رفض طلبات السحب",
  manage_teacher_payments: "تسجيل دفعات للمعلمين",
  manage_teacher_earnings: "تعديل أرباح المعلمين",
  manage_wallets: "إدارة محافظ المستخدمين",
  manage_violations: "مراجعة المخالفات والمكالمات",
  manage_ai_audit: "مراجعة جودة مخرجات الذكاء الاصطناعي",
  customer_support: "الرد على تذاكر الدعم والمحادثات",
  manage_admins: "⚠️ إنشاء وإدارة فريق الإدارة وصلاحياتهم",
};

const HIGH_RISK = new Set([
  "manage_admins", "manage_withdrawals", "manage_teacher_earnings",
  "manage_teacher_payments", "manage_wallets", "manage_payments",
]);

export default function PermissionEditorDialog({
  open, onOpenChange, member, allPermissions, canGrantManageAdmins, onSaved,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(true);
  const [saving, setSaving] = useState(false);

  const initialSet = useMemo(
    () => new Set(member?.permissions || []),
    [member?.user_id, member?.permissions?.join("|")]
  );

  useEffect(() => { setSelected(new Set(member?.permissions || [])); }, [member?.user_id]);

  if (!member) return null;

  const grouped = allPermissions.reduce((acc, p) => {
    (acc[p.group] = acc[p.group] || []).push(p);
    return acc;
  }, {} as Record<string, PermDef[]>);

  const toAdd = [...selected].filter((p) => !initialSet.has(p));
  const toRemove = [...initialSet].filter((p) => !selected.has(p));
  const hasChanges = toAdd.length > 0 || toRemove.length > 0;

  const toggle = (key: string, v: boolean | "indeterminate") => {
    if (key === "manage_admins" && !canGrantManageAdmins) {
      toast.error("فقط المدير العام يمكنه منح صلاحية إدارة الفريق");
      return;
    }
    const next = new Set(selected);
    if (v) next.add(key); else next.delete(key);
    setSelected(next);
  };

  const reset = () => setSelected(new Set(member.permissions));

  const save = async () => {
    if (!hasChanges) { onOpenChange(false); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Insert added
      if (toAdd.length > 0) {
        const rows = toAdd.map((permission) => ({
          user_id: member.user_id, permission, granted_by: user?.id,
        }));
        const { error } = await (supabase as any).from("user_permissions").insert(rows);
        if (error) throw error;
      }
      // Delete removed
      if (toRemove.length > 0) {
        const { error } = await (supabase as any).from("user_permissions")
          .delete().eq("user_id", member.user_id).in("permission", toRemove);
        if (error) throw error;
      }
      await logAdminAction({
        action: "update_permissions",
        category: "team_management",
        description: `تحديث صلاحيات ${member.full_name} (+${toAdd.length} / -${toRemove.length})`,
        target_table: "user_permissions",
        target_id: member.user_id,
        before: { permissions: member.permissions },
        after: { permissions: Array.from(selected) },
        metadata: { added: toAdd, removed: toRemove },
      });
      toast.success("تم حفظ الصلاحيات");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ أثناء الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            تحرير صلاحيات: {member.full_name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-3">
          {member.is_full_admin && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-warning/5 border border-warning/30 text-xs">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
              هذا العضو مدير عام ويملك جميع الصلاحيات تلقائياً. يمكن تعيين صلاحيات إضافية ولكنها لن تؤثر.
            </div>
          )}

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px]">حالياً: {initialSet.size}</Badge>
              <Badge variant="outline" className="text-[10px] bg-success/5 text-success border-success/30">+{toAdd.length}</Badge>
              <Badge variant="outline" className="text-[10px] bg-destructive/5 text-destructive border-destructive/30">-{toRemove.length}</Badge>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => setShowPreview((v) => !v)} className="h-7 text-[11px] gap-1">
                {showPreview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showPreview ? "إخفاء المعاينة" : "إظهار المعاينة"}
              </Button>
              <Button size="sm" variant="ghost" onClick={reset} disabled={!hasChanges} className="h-7 text-[11px] gap-1">
                <RotateCcw className="h-3 w-3" /> استرجاع
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-4">
              {Object.entries(grouped).map(([group, perms]) => (
                <div key={group}>
                  <p className="text-xs font-bold text-muted-foreground mb-1.5 sticky top-0 bg-background py-1">
                    {group}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {perms.map((p) => {
                      const isSel = selected.has(p.key);
                      const wasSet = initialSet.has(p.key);
                      const changed = isSel !== wasSet;
                      const risky = HIGH_RISK.has(p.key);
                      const blocked = p.key === "manage_admins" && !canGrantManageAdmins;
                      return (
                        <label
                          key={p.key}
                          className={`flex items-start gap-2 p-2 rounded border transition-all cursor-pointer ${
                            changed
                              ? isSel
                                ? "bg-success/5 border-success/40"
                                : "bg-destructive/5 border-destructive/40"
                              : isSel
                                ? "bg-primary/5 border-primary/30"
                                : "border-border hover:bg-muted/30"
                          } ${blocked ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          <Checkbox
                            checked={isSel}
                            onCheckedChange={(v) => toggle(p.key, v)}
                            disabled={blocked}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold flex items-center gap-1 flex-wrap">
                              {p.label}
                              {risky && <Badge className="text-[8px] h-3.5 px-1 bg-destructive/10 text-destructive border-destructive/30">حساس</Badge>}
                              {changed && (
                                <Badge className={`text-[8px] h-3.5 px-1 ${isSel ? "bg-success/10 text-success border-success/30" : "bg-destructive/10 text-destructive border-destructive/30"}`}>
                                  {isSel ? "+" : "−"}
                                </Badge>
                              )}
                            </p>
                            {showPreview && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                                {IMPACT_DESCRIPTIONS[p.key] || "—"}
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Impact summary */}
          {showPreview && hasChanges && (
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5 max-h-32 overflow-auto">
              <p className="text-[11px] font-bold text-foreground flex items-center gap-1">
                <Eye className="h-3 w-3" /> معاينة تأثير التغييرات
              </p>
              {toAdd.length > 0 && (
                <div className="text-[10px] text-success">
                  ✓ سيكتسب: {toAdd.map((k) => allPermissions.find((p) => p.key === k)?.label || k).join(" • ")}
                </div>
              )}
              {toRemove.length > 0 && (
                <div className="text-[10px] text-destructive">
                  ✕ سيفقد: {toRemove.map((k) => allPermissions.find((p) => p.key === k)?.label || k).join(" • ")}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={!hasChanges || saving} className="gap-1">
            <Save className="h-4 w-4" />
            {saving ? "جاري الحفظ..." : `حفظ التغييرات${hasChanges ? ` (${toAdd.length + toRemove.length})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
