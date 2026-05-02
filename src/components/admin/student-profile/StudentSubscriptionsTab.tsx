import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { CreditCard, Plus, Minus, RefreshCw, Calendar, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { StudentBundle } from "@/pages/AdminStudentProfile";

const StudentSubscriptionsTab = ({ data, studentId, onRefresh }: { data: StudentBundle; studentId: string; onRefresh: () => void }) => {
  const [adjustOpen, setAdjustOpen] = useState<{ subId: string; type: "add" | "subtract" } | null>(null);
  const [adjustMin, setAdjustMin] = useState("");
  const [busy, setBusy] = useState(false);

  const adjustMinutes = async () => {
    if (!adjustOpen) return;
    const minutes = parseInt(adjustMin, 10);
    if (!minutes || minutes <= 0) return toast.error("أدخل عدد دقائق صحيح");
    setBusy(true);
    try {
      const sub = data.subscriptions.find((s: any) => s.id === adjustOpen.subId);
      if (!sub) throw new Error("الاشتراك غير موجود");
      const newRemaining = adjustOpen.type === "add"
        ? (sub.remaining_minutes || 0) + minutes
        : Math.max(0, (sub.remaining_minutes || 0) - minutes);
      const { error } = await supabase
        .from("user_subscriptions")
        .update({ remaining_minutes: newRemaining })
        .eq("id", adjustOpen.subId);
      if (error) throw error;
      await supabase.from("admin_audit_log").insert({
        actor_id: (await supabase.auth.getUser()).data.user?.id,
        action: adjustOpen.type === "add" ? "credit_minutes" : "deduct_minutes",
        category: "subscriptions",
        description: `${adjustOpen.type === "add" ? "إضافة" : "خصم"} ${minutes} دقيقة لاشتراك الطالب`,
        target_table: "user_subscriptions",
        target_id: adjustOpen.subId,
      });
      toast.success("تم تعديل الدقائق");
      setAdjustOpen(null);
      setAdjustMin("");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || "فشل التعديل");
    } finally {
      setBusy(false);
    }
  };

  if (data.subscriptions.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <CreditCard className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">لا توجد اشتراكات سابقة لهذا الطالب</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {data.subscriptions.map((s: any) => {
        const totalMin = s.subscription_plans?.session_duration_minutes && s.sessions_count
          ? s.subscription_plans.session_duration_minutes * s.sessions_count
          : (s.remaining_minutes || 0);
        const used = Math.max(0, totalMin - (s.remaining_minutes || 0));
        const pct = totalMin > 0 ? (used / totalMin) * 100 : 0;
        const isExpired = s.ends_at && new Date(s.ends_at) < new Date();

        return (
          <Card key={s.id} className={s.is_active ? "border-emerald-500/30" : ""}>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-bold">{s.subscription_plans?.name_ar || "باقة"}</h3>
                    {s.is_active && !isExpired ? (
                      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/15">فعّال</Badge>
                    ) : isExpired ? (
                      <Badge variant="outline" className="text-destructive border-destructive/30">منتهي</Badge>
                    ) : (
                      <Badge variant="outline">غير نشط</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {s.subscription_plans?.price && <div>السعر: <span className="font-bold text-foreground">{s.subscription_plans.price} ريال</span></div>}
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {s.starts_at && <>من {new Date(s.starts_at).toLocaleDateString("ar-SA")}</>}
                      {s.ends_at && <> حتى {new Date(s.ends_at).toLocaleDateString("ar-SA")}</>}
                    </div>
                  </div>
                </div>
                {s.is_active && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setAdjustOpen({ subId: s.id, type: "add" })}>
                      <Plus className="h-3 w-3" /> دقائق
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setAdjustOpen({ subId: s.id, type: "subtract" })}>
                      <Minus className="h-3 w-3" /> دقائق
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2 mb-3">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">نسبة الاستهلاك</span>
                  <span className="font-bold">{pct.toFixed(0)}%</span>
                </div>
                <Progress value={pct} className="h-2" />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <div className="text-base font-bold text-primary">{s.remaining_minutes || 0}</div>
                  <div className="text-[10px] text-muted-foreground">دقيقة متبقية</div>
                </div>
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <div className="text-base font-bold">{s.sessions_remaining || 0}/{s.sessions_count || 0}</div>
                  <div className="text-[10px] text-muted-foreground">حصص متبقية</div>
                </div>
                <div className="rounded-lg bg-muted/50 p-2 text-center">
                  <div className="text-base font-bold">{used}</div>
                  <div className="text-[10px] text-muted-foreground">دقائق مستهلكة</div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardContent className="p-4 flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <div className="text-sm flex-1">
            <div className="font-bold">اقتراح ذكي</div>
            <div className="text-xs text-muted-foreground">للترقية أو تجديد اشتراك الطالب — افتح تبويب "تحليل AI" للتوصيات الذكية.</div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!adjustOpen} onOpenChange={(o) => !o && setAdjustOpen(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{adjustOpen?.type === "add" ? "إضافة دقائق" : "خصم دقائق"}</DialogTitle>
          </DialogHeader>
          <Input type="number" placeholder="عدد الدقائق" value={adjustMin} onChange={(e) => setAdjustMin(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(null)}>إلغاء</Button>
            <Button onClick={adjustMinutes} disabled={busy}>{busy ? "جاري..." : "تأكيد"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentSubscriptionsTab;
