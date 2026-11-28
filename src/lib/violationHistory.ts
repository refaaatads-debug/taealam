import { severityOf, SEVERITY_ORDER, type ViolationSeverity } from "./violationMeta";

export interface HistoryRow {
  user_id: string;
  violation_type?: string | null;
  is_reviewed?: boolean | null;
  is_false_positive?: boolean | null;
  created_at?: string;
}

export interface UserHistorySummary {
  total: number; // false positives are not counted
  pending: number;
  confirmed: number;
  falsePositive: number;
  bySeverity: Record<ViolationSeverity, number>;
  byType: Record<string, number>;
  firstAt: string | null;
  lastAt: string | null;
  highestSeverity: ViolationSeverity | null;
  escalate: boolean; // 3+ high/critical in the last 30 days, or any critical
}

const DAY = 24 * 60 * 60 * 1000;

export function summarizeUserViolations(rows: HistoryRow[], userId: string, now = Date.now()): UserHistorySummary {
  const mine = rows.filter((r) => r.user_id === userId);
  const counted = mine.filter((r) => !r.is_false_positive);
  const bySeverity: Record<ViolationSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const byType: Record<string, number> = {};
  let highest: ViolationSeverity | null = null;
  let recentHigh = 0;
  for (const r of counted) {
    const sev = severityOf(r.violation_type);
    bySeverity[sev]++;
    const t = r.violation_type || "unknown";
    byType[t] = (byType[t] || 0) + 1;
    if (!highest || SEVERITY_ORDER[sev] > SEVERITY_ORDER[highest]) highest = sev;
    const at = r.created_at ? Date.parse(r.created_at) : NaN;
    if ((sev === "high" || sev === "critical") && Number.isFinite(at) && now - at <= 30 * DAY) recentHigh++;
  }
  const dates = counted.map((r) => r.created_at).filter(Boolean).sort() as string[];
  return {
    total: counted.length,
    pending: counted.filter((r) => !r.is_reviewed).length,
    confirmed: counted.filter((r) => r.is_reviewed).length,
    falsePositive: mine.length - counted.length,
    bySeverity,
    byType,
    firstAt: dates[0] ?? null,
    lastAt: dates[dates.length - 1] ?? null,
    highestSeverity: highest,
    escalate: bySeverity.critical > 0 || recentHigh >= 3,
  };
}
