import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";
import { summarizeUserViolations } from "@/lib/violationHistory";
import { metaFor, severityOf, SEVERITY_LABELS, sortBySeverityThenDate } from "@/lib/violationMeta";

interface Props {
  userId: string;
  userName: string;
  violations: any[];
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ar-SA") : "—");

// Per-user history: counts, escalation flag and a timeline. Reads the list the tab already loaded.
export default function ViolationUserHistory({ userId, userName, violations }: Props) {
  const mine = useMemo(
    () => sortBySeverityThenDate(violations.filter((v) => v.user_id === userId)).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")),
    [violations, userId],
  );
  const s = useMemo(() => summarizeUserViolations(violations, userId), [violations, userId]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-xs h-7 rounded-lg">
          <History className="h-3 w-3 ml-1" /> سجل المستخدم ({s.total})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-sm">سجل مخالفات {userName}</DialogTitle>
        </DialogHeader>
        {s.escalate && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive font-bold">
            يحتاج تصعيد: مخالفات عالية متكررة خلال 30 يوم أو مخالفة حرجة
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-muted/40 p-2"><div className="font-bold text-base">{s.total}</div>الإجمالي</div>
          <div className="rounded-lg bg-muted/40 p-2"><div className="font-bold text-base">{s.pending}</div>قيد المراجعة</div>
          <div className="rounded-lg bg-muted/40 p-2"><div className="font-bold text-base">{s.confirmed}</div>مؤكدة</div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          أول مخالفة: {fmt(s.firstAt)} · آخر مخالفة: {fmt(s.lastAt)} · إنذارات كاذبة: {s.falsePositive}
        </p>
        <div className="space-y-2">
          {mine.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">لا توجد مخالفات</p>}
          {mine.map((v) => (
            <div key={v.id} className={`rounded-lg border p-2 text-xs ${v.is_false_positive ? "opacity-50" : ""}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px]">{SEVERITY_LABELS[severityOf(v.violation_type)]} · {metaFor(v.violation_type).label}</Badge>
                <span className="text-muted-foreground">{fmt(v.created_at)} {v.is_false_positive ? "· ملغاة" : v.is_reviewed ? "· مؤكدة" : "· قيد المراجعة"}</span>
              </div>
              <p className="mt-1 text-foreground break-words">{v.detected_text || v.original_message || ""}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
