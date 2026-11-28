import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { removeConfirmedWarning } from "@/lib/violationReview";

interface Props {
  violation: any;
  adminId?: string;
  onViolationChange: (patch: Record<string, unknown>) => void;
}

// Shows the user's appeal for this violation and lets an admin accept or reject it.
// Accepting marks the violation as a false positive and takes back its warning.
export default function ViolationAppealReview({ violation, adminId, onViolationChange }: Props) {
  const [appeal, setAppeal] = useState<any | null>(null);

  useEffect(() => {
    let alive = true;
    (supabase as any).from("violation_appeals").select("*").eq("violation_id", violation.id).maybeSingle()
      .then(({ data }: any) => { if (alive) setAppeal(data || null); });
    return () => { alive = false; };
  }, [violation.id]);

  if (!appeal) return null;

  const decide = async (status: "accepted" | "rejected") => {
    const note = window.prompt(status === "accepted" ? "ملاحظة للمستخدم (اختياري):" : "سبب الرفض (يظهر للمستخدم):") || "";
    if (status === "rejected" && !note.trim()) return;
    const { error } = await (supabase as any).from("violation_appeals")
      .update({ status, admin_note: note.trim() || null, decided_by: adminId, decided_at: new Date().toISOString() }).eq("id", appeal.id);
    if (error) { toast.error("تعذر حفظ القرار"); return; }
    if (status === "accepted") {
      await (supabase as any).from("violations").update({ is_reviewed: true, is_false_positive: true, reviewed_by: adminId }).eq("id", violation.id);
      if (violation.is_reviewed && !violation.is_false_positive) await removeConfirmedWarning(violation.user_id);
      onViolationChange({ is_reviewed: true, is_false_positive: true });
    }
    await supabase.from("notifications").insert({
      user_id: violation.user_id,
      title: status === "accepted" ? "✅ تم قبول اعتراضك" : "تم رفض اعتراضك",
      body: note.trim() || (status === "accepted" ? "تم إلغاء المخالفة." : "بقيت المخالفة كما هي."),
      type: "violation",
    });
    setAppeal({ ...appeal, status, admin_note: note.trim() || null });
    toast.success("تم حفظ القرار");
  };

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 mb-3">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-[10px] font-bold text-primary">اعتراض المستخدم</p>
        <Badge variant="outline" className="text-[10px]">
          {appeal.status === "pending" ? "قيد المراجعة" : appeal.status === "accepted" ? "مقبول" : "مرفوض"}
        </Badge>
      </div>
      <p className="text-xs text-foreground break-words">{appeal.message}</p>
      {appeal.status === "pending" && (
        <div className="flex gap-2 mt-2">
          <Button size="sm" className="text-xs h-7 rounded-lg" onClick={() => decide("accepted")}>قبول الاعتراض</Button>
          <Button size="sm" variant="outline" className="text-xs h-7 rounded-lg" onClick={() => decide("rejected")}>رفض</Button>
        </div>
      )}
    </div>
  );
}
