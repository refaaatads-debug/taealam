import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Star, XCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Thresholds for the automatic flags (last 90 days).
const LOW_RATING = 3.5;       // average of recent reviews
const MIN_REVIEWS = 3;        // reviews needed before a rating counts
const HIGH_CANCEL_RATE = 0.3; // share of bookings cancelled by the teacher
const MIN_BOOKINGS = 5;       // bookings needed before the rate counts
const MAX_VIOLATIONS = 2;     // confirmed violations (not marked false positive)
const WINDOW_DAYS = 90;

type Flag = "low_rating" | "many_cancellations" | "violations" | "warned";

const FLAG_LABEL: Record<Flag, string> = {
  low_rating: "تقييم منخفض",
  many_cancellations: "إلغاءات كثيرة من المعلم",
  violations: "مخالفات",
  warned: "عليه تحذير / حظر",
};

interface Row {
  user_id: string;
  name: string;
  reviewCount: number;
  avgRating: number | null;
  lowReviews: number;
  bookings: number;
  cancelledByTeacher: number;
  cancelRate: number;
  violations: number;
  warnings: number;
  banned: boolean;
  flags: Flag[];
}

async function fetchAll<T = any>(build: () => any, pageSize = 1000, maxPages = 30): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < maxPages; p++) {
    const { data, error } = await build().range(p * pageSize, p * pageSize + pageSize - 1);
    if (error || !data) break;
    out.push(...(data as T[]));
    if (data.length < pageSize) break;
  }
  return out;
}

export default function TeacherQualityTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyFlagged, setOnlyFlagged] = useState(true);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
    const { data: teachers } = await supabase.from("teacher_profiles").select("user_id").eq("is_approved", true);
    const ids = (teachers ?? []).map((t: any) => t.user_id as string);
    if (!ids.length) { setRows([]); setLoading(false); return; }

    const [reviews, bookings, violations, warnings, profiles] = await Promise.all([
      fetchAll(() => supabase.from("reviews").select("teacher_id, rating").gte("created_at", since).order("created_at")),
      fetchAll(() => supabase.from("bookings").select("teacher_id, status, cancelled_by").gte("created_at", since).order("created_at")),
      fetchAll(() => (supabase as any).from("violations").select("user_id, is_false_positive").order("created_at")),
      fetchAll(() => supabase.from("user_warnings").select("user_id, warning_count, is_banned, banned_until").order("created_at")),
      supabase.from("profiles").select("user_id, full_name").in("user_id", ids),
    ]);
    const names = new Map((profiles.data ?? []).map((p: any) => [p.user_id, p.full_name || "بدون اسم"]));
    const idSet = new Set(ids);

    const acc = new Map<string, Row>();
    ids.forEach((id) => acc.set(id, {
      user_id: id, name: names.get(id) || "بدون اسم", reviewCount: 0, avgRating: null, lowReviews: 0,
      bookings: 0, cancelledByTeacher: 0, cancelRate: 0, violations: 0, warnings: 0, banned: false, flags: [],
    }));
    const sums = new Map<string, number>();
    reviews.forEach((r: any) => {
      const row = acc.get(r.teacher_id); if (!row) return;
      row.reviewCount += 1; sums.set(r.teacher_id, (sums.get(r.teacher_id) ?? 0) + Number(r.rating || 0));
      if (Number(r.rating) <= 2) row.lowReviews += 1;
    });
    bookings.forEach((b: any) => {
      const row = acc.get(b.teacher_id); if (!row) return;
      row.bookings += 1;
      if (b.status === "cancelled" && b.cancelled_by === b.teacher_id) row.cancelledByTeacher += 1;
    });
    violations.forEach((v: any) => {
      if (!idSet.has(v.user_id) || v.is_false_positive) return;
      acc.get(v.user_id)!.violations += 1;
    });
    const nowMs = Date.now();
    warnings.forEach((w: any) => {
      if (!idSet.has(w.user_id)) return;
      const row = acc.get(w.user_id)!;
      row.warnings += Number(w.warning_count || 0);
      if (w.is_banned && (!w.banned_until || new Date(w.banned_until).getTime() > nowMs)) row.banned = true;
    });

    const result = [...acc.values()].map((row) => {
      row.avgRating = row.reviewCount ? (sums.get(row.user_id) ?? 0) / row.reviewCount : null;
      row.cancelRate = row.bookings ? row.cancelledByTeacher / row.bookings : 0;
      if (row.avgRating !== null && row.reviewCount >= MIN_REVIEWS && row.avgRating < LOW_RATING) row.flags.push("low_rating");
      if (row.bookings >= MIN_BOOKINGS && row.cancelRate > HIGH_CANCEL_RATE) row.flags.push("many_cancellations");
      if (row.violations >= MAX_VIOLATIONS) row.flags.push("violations");
      if (row.banned || row.warnings > 0) row.flags.push("warned");
      return row;
    }).sort((a, b) => b.flags.length - a.flags.length || (a.avgRating ?? 5) - (b.avgRating ?? 5));
    setRows(result);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const shown = useMemo(() => (onlyFlagged ? rows.filter((r) => r.flags.length) : rows), [rows, onlyFlagged]);
  const flaggedCount = rows.filter((r) => r.flags.length).length;

  return (
    <div className="space-y-4" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            جودة المعلمين
            <span className="text-sm font-normal text-muted-foreground">({flaggedCount} معلم عليهم علامات من {rows.length})</span>
            <span className="mr-auto flex gap-2">
              <Button size="sm" variant={onlyFlagged ? "default" : "outline"} onClick={() => setOnlyFlagged(true)}>عليهم علامات</Button>
              <Button size="sm" variant={!onlyFlagged ? "default" : "outline"} onClick={() => setOnlyFlagged(false)}>الكل</Button>
              <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            آخر {WINDOW_DAYS} يوماً. العلامات: متوسط التقييم أقل من {LOW_RATING} (بعد {MIN_REVIEWS} تقييمات)، أو إلغاء المعلم لأكثر من {Math.round(HIGH_CANCEL_RATE * 100)}% من حجوزاته (بعد {MIN_BOOKINGS} حجوزات)، أو {MAX_VIOLATIONS}+ مخالفات مؤكدة، أو وجود تحذير/حظر.
          </p>
          {loading && <p className="text-muted-foreground">جارٍ التحميل...</p>}
          {!loading && shown.length === 0 && <p className="text-muted-foreground">لا توجد علامات حالياً.</p>}
          {shown.map((r) => (
            <div key={r.user_id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{r.name}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {r.flags.map((f) => <Badge key={f} variant="destructive" className="text-[11px]">{FLAG_LABEL[f]}</Badge>)}
                  {r.flags.length === 0 && <Badge variant="secondary" className="text-[11px]">لا علامات</Badge>}
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-yellow-500" />{r.avgRating === null ? "—" : r.avgRating.toFixed(1)} ({r.reviewCount})</span>
                <span className="flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-destructive" />إلغاء {r.cancelledByTeacher}/{r.bookings}</span>
                <span className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" />مخالفات {r.violations}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
