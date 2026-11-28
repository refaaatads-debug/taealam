// Violations of one teacher in one month, for display next to the manual earnings form.
// Display only: nothing here changes an amount.
import { metaFor, severityOf, SEVERITY_ORDER } from "./violationMeta";

export interface MonthViolationRow {
  id: string;
  violation_type?: string | null;
  detected_text?: string | null;
  original_message?: string | null;
  source?: string | null;
  is_reviewed?: boolean | null;
  is_false_positive?: boolean | null;
  deleted_at?: string | null;
  created_at?: string | null;
}

// "2026-11" -> ISO bounds [from, to) for that calendar month in Riyadh time (UTC+3).
export function monthBoundsIso(month: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month || "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const ny = mo === 12 ? y + 1 : y;
  const nm = mo === 12 ? 1 : mo + 1;
  return {
    from: new Date(`${y}-${pad(mo)}-01T00:00:00+03:00`).toISOString(),
    to: new Date(`${ny}-${pad(nm)}-01T00:00:00+03:00`).toISOString(),
  };
}

export interface MonthViolationSummary {
  total: number; // false positives and archived rows are not counted
  confirmed: number;
  pending: number;
  excluded: number; // false positives + archived, shown only as a small note
  byType: Array<{ type: string; label: string; count: number }>;
  items: MonthViolationRow[]; // counted rows, newest first
}

export function summarizeMonthViolations(rows: MonthViolationRow[]): MonthViolationSummary {
  const counted = rows.filter((r) => !r.is_false_positive && !r.deleted_at);
  const counts = new Map<string, number>();
  for (const r of counted) {
    const t = r.violation_type || "unknown";
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  const byType = [...counts.entries()]
    .map(([type, count]) => ({ type, label: metaFor(type).label, count }))
    .sort((a, b) => SEVERITY_ORDER[severityOf(b.type)] - SEVERITY_ORDER[severityOf(a.type)] || b.count - a.count);
  const items = [...counted].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return {
    total: counted.length,
    confirmed: counted.filter((r) => r.is_reviewed).length,
    pending: counted.filter((r) => !r.is_reviewed).length,
    excluded: rows.length - counted.length,
    byType,
    items,
  };
}
