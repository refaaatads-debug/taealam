import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, ShieldCheck, Loader2, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { monthBoundsIso, summarizeMonthViolations, type MonthViolationRow } from "@/lib/monthViolations";
import { metaFor, severityOf, SEVERITY_LABELS } from "@/lib/violationMeta";

const SHORT_LIST = 4;

// Display only. Nothing here changes or suggests an amount.
const TeacherMonthViolations = ({ teacherId, month }: { teacherId: string; month: string }) => {
  const [rows, setRows] = useState<MonthViolationRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const bounds = monthBoundsIso(month);
    if (!teacherId || !bounds) { setRows(null); return; }
    let cancelled = false;
    setRows(null);
    setFailed(false);
    setShowAll(false);
    (supabase as any).from("violations")
      .select("id, violation_type, detected_text, original_message, source, is_reviewed, is_false_positive, deleted_at, created_at")
      .eq("user_id", teacherId)
      .is("deleted_at", null)
      .gte("created_at", bounds.from)
      .lt("created_at", bounds.to)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error }: any) => {
        if (cancelled) return;
        if (error) { setFailed(true); setRows([]); return; }
        setRows(data || []);
      });
    return () => { cancelled = true; };
  }, [teacherId, month]);

  const summary = useMemo(() => summarizeMonthViolations(rows || []), [rows]);
  if (!teacherId || !monthBoundsIso(month)) return null;

  const visible = showAll ? summary.items : summary.items.slice(0, SHORT_LIST);
  const fmt = (iso?: string | null) => iso
    ? new Date(iso).toLocaleDateString("ar-SA", { day: "numeric", month: "short" }) : "";

  return (
    <div className="md:col-span-2 p-3 rounded-xl border border-border bg-card space-y-2" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {summary.total > 0
            ? <ShieldAlert className="h-4 w-4 text-warning" />
            : <ShieldCheck className="h-4 w-4 text-success" />}
          <span className="text-sm font-bold text-foreground">مخالفات المعلم في هذا الشهر</span>
          {rows === null && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        {rows !== null && !failed && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px]">الإجمالي {summary.total}</Badge>
            <Badge className="text-[10px] border-0 bg-destructive/15 text-destructive">مؤكدة {summary.confirmed}</Badge>
            <Badge className="text-[10px] border-0 bg-warning/15 text-warning">قيد المراجعة {summary.pending}</Badge>
          </div>
        )}
      </div>

      {failed && <p className="text-xs text-destructive">تعذر تحميل المخالفات.</p>}

      {rows !== null && !failed && summary.total === 0 && (
        <p className="text-xs text-muted-foreground">لا توجد مخالفات مسجلة لهذا المعلم في الشهر المحدد.</p>
      )}

      {summary.byType.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {summary.byType.map((t) => (
            <span key={t.type} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-foreground">
              {t.label} <span className="font-bold">{t.count}</span>
            </span>
          ))}
        </div>
      )}

      {visible.length > 0 && (
        <ul className="divide-y divide-border/60 rounded-lg border border-border/60 overflow-hidden">
          {visible.map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs bg-muted/20">
              <span className="text-muted-foreground w-14 shrink-0">{fmt(r.created_at)}</span>
              <span className="font-bold text-foreground shrink-0">{metaFor(r.violation_type).label}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">({SEVERITY_LABELS[severityOf(r.violation_type)]})</span>
              <span className="truncate text-muted-foreground flex-1" title="دليل مخفي">{r.original_message || r.detected_text}</span>
              <Badge variant={r.is_reviewed ? "default" : "secondary"} className="text-[10px] shrink-0">
                {r.is_reviewed ? "مؤكدة" : "قيد المراجعة"}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {summary.items.length > SHORT_LIST && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="text-xs text-primary flex items-center gap-1">
          <ChevronDown className={`h-3 w-3 transition-transform ${showAll ? "rotate-180" : ""}`} />
          {showAll ? "عرض أقل" : `عرض الكل (${summary.items.length})`}
        </button>
      )}

      <p className="text-[10px] text-muted-foreground">
        للعرض فقط، ولا يتم خصم أي مبلغ تلقائياً. المخالفات الملغاة (إنذار كاذب) والمؤرشفة غير محسوبة
        {summary.excluded > 0 ? ` (${summary.excluded} مستبعدة)` : ""}. الدليل المعروض مخفي.
      </p>
    </div>
  );
};

export default TeacherMonthViolations;
