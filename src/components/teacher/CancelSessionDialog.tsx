import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldAlert, Loader2, ArrowRight, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: string | null;
  studentId?: string | null;
  onCancelled?: () => void;
}

const MONTHLY_LIMIT = 3;

export default function CancelSessionDialog({
  open,
  onOpenChange,
  bookingId,
  studentId,
  onCancelled,
}: Props) {
  const { user, profile } = useAuth();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [monthCount, setMonthCount] = useState<number>(0);
  const [loadingCount, setLoadingCount] = useState(false);
  const [stage, setStage] = useState<"form" | "confirm">("form");

  useEffect(() => {
    if (!open || !user) return;
    setReason("");
    setStage("form");
    setLoadingCount(true);
    supabase
      .rpc("teacher_monthly_cancellations" as any, { _teacher_id: user.id })
      .then(({ data }) => {
        setMonthCount(typeof data === "number" ? data : 0);
        setLoadingCount(false);
      });
  }, [open, user]);

  const remaining = Math.max(0, MONTHLY_LIMIT - monthCount);
  const willExceed = monthCount >= MONTHLY_LIMIT;

  const goConfirm = () => {
    if (reason.trim().length < 10) {
      toast.error("يجب كتابة سبب الإلغاء (10 أحرف على الأقل)");
      return;
    }
    setStage("confirm");
  };

  const handleConfirm = async () => {
    if (!user || !bookingId) return;
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const { error: updateErr } = await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          session_status: "cancelled",
          cancellation_reason: reason.trim(),
          cancelled_at: now,
          cancelled_by: user.id,
        } as any)
        .eq("id", bookingId)
        .eq("teacher_id", user.id);

      if (updateErr) throw updateErr;

      if (studentId) {
        await supabase.from("notifications").insert({
          user_id: studentId,
          title: "تم إلغاء حصتك ❌",
          body: `قام المعلم ${profile?.full_name || ""} بإلغاء حصتك. السبب: ${reason.trim()}`,
          type: "booking",
        });
      }

      const newCount = monthCount + 1;
      if (newCount > MONTHLY_LIMIT) {
        await supabase.from("user_warnings").insert({
          user_id: user.id,
          warning_type: "excessive_cancellation",
          description: `تجاوز حد الإلغاءات الشهرية (${newCount}/${MONTHLY_LIMIT}). آخر سبب: ${reason.trim()}`,
          warning_count: 1,
        } as any);

        const { data: admins } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        if (admins && admins.length > 0) {
          await supabase.from("notifications").insert(
            admins.map((a: any) => ({
              user_id: a.user_id,
              title: "🚨 تجاوز حد الإلغاءات الشهرية",
              body: `المعلم ${profile?.full_name || user.id} ألغى ${newCount} حصص هذا الشهر (الحد ${MONTHLY_LIMIT}). آخر سبب: ${reason.trim()} | افتح: /admin?tab=violations`,
              type: "warning",
            }))
          );
        }
        toast.warning(`تم تسجيل الإلغاء — تجاوزت الحد الشهري (${newCount}/${MONTHLY_LIMIT}) وتم إنذار الإدارة`);
      } else {
        toast.success(`تم إلغاء الحصة. (${newCount}/${MONTHLY_LIMIT} هذا الشهر)`);
      }

      onCancelled?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "تعذر إلغاء الحصة");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {stage === "form" ? "تحذير: إلغاء الحصة" : "تأكيد نهائي للإلغاء"}
          </DialogTitle>
          <DialogDescription>
            {stage === "form"
              ? "إلغاء الحصة يؤثر على تقييمك ويزعج الطالب. اكتب سبباً واضحاً للإلغاء."
              : "راجع سبب الإلغاء قبل التأكيد. لا يمكن التراجع بعد الإرسال."}
          </DialogDescription>
        </DialogHeader>

        {stage === "form" ? (
          <div className="space-y-3 py-2">
            <div
              className={`rounded-xl p-3 border flex items-center gap-2 ${
                willExceed
                  ? "bg-destructive/10 border-destructive/30"
                  : remaining <= 1
                  ? "bg-amber-500/10 border-amber-500/30"
                  : "bg-muted/40 border-border"
              }`}
            >
              <ShieldAlert
                className={`h-4 w-4 ${
                  willExceed ? "text-destructive" : remaining <= 1 ? "text-amber-600" : "text-muted-foreground"
                }`}
              />
              <div className="flex-1 text-xs">
                <p className="font-bold text-foreground">
                  إلغاءات هذا الشهر: {loadingCount ? "..." : `${monthCount}/${MONTHLY_LIMIT}`}
                </p>
                <p className="text-muted-foreground">
                  {willExceed
                    ? "⚠️ ستتجاوز الحد المسموح — سيتم إنذار الإدارة فوراً"
                    : remaining <= 1
                    ? `تبقى ${remaining} إلغاء فقط قبل التحذير الشديد`
                    : `يمكنك إلغاء ${remaining} حصص أخرى هذا الشهر`}
                </p>
              </div>
              <Badge variant={willExceed ? "destructive" : "outline"} className="text-[10px]">
                الحد {MONTHLY_LIMIT}/شهر
              </Badge>
            </div>

            <div>
              <label className="text-sm font-bold mb-1.5 block">
                سبب الإلغاء <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: ظرف طارئ في العائلة، مرض مفاجئ..."
                rows={4}
                maxLength={500}
                className="resize-none"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {reason.length}/500 — سيظهر هذا السبب للإدارة وللطالب
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="rounded-xl bg-destructive/5 border border-destructive/30 p-4">
              <p className="text-xs font-bold text-destructive mb-2">معاينة سبب الإلغاء:</p>
              <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                {reason.trim()}
              </p>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              سيتم إرسال هذا السبب للطالب وللإدارة فور التأكيد.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {stage === "form" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                تراجع
              </Button>
              <Button
                variant="destructive"
                onClick={goConfirm}
                disabled={submitting || reason.trim().length < 10}
              >
                متابعة <ArrowLeft className="h-4 w-4 mr-1" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStage("form")} disabled={submitting}>
                <ArrowRight className="h-4 w-4 ml-1" /> رجوع للتعديل
              </Button>
              <Button variant="destructive" onClick={handleConfirm} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" /> جاري الإلغاء...
                  </>
                ) : (
                  "تأكيد الإلغاء نهائياً"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
