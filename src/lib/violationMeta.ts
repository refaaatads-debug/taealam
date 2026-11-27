// One place that defines what each violation type means: label, short reason and severity.
// Severity is derived from the type, so no database change is needed.

export type ViolationSeverity = "low" | "medium" | "high" | "critical";

export interface ViolationMeta {
  label: string;
  reason: string;
  severity: ViolationSeverity;
}

export const VIOLATION_META: Record<string, ViolationMeta> = {
  teacher_late: { label: "تأخر المعلم", reason: "تأخر المعلم عن موعد الحصة", severity: "low" },
  teacher_silence: { label: "صمت المعلم", reason: "صمت المعلم أثناء الحصة (5 دقائق بدون صوت)", severity: "low" },
  off_topic: { label: "خروج عن الموضوع", reason: "خروج عن موضوع الجلسة", severity: "low" },
  platform_mention: { label: "ذكر منصة خارجية", reason: "ذكر واتساب أو تلغرام أو منصة تواصل خارجية", severity: "medium" },
  profanity: { label: "ألفاظ غير لائقة", reason: "ألفاظ غير لائقة", severity: "medium" },
  contact_sharing: { label: "مشاركة بيانات اتصال", reason: "مشاركة رقم هاتف أو بريد أو حساب تواصل", severity: "high" },
  phone_number: { label: "رقم هاتف", reason: "مشاركة رقم هاتف", severity: "high" },
  email: { label: "بريد إلكتروني", reason: "مشاركة بريد إلكتروني", severity: "high" },
  social_media_attempt: { label: "حساب تواصل اجتماعي", reason: "محاولة تبادل حساب تواصل اجتماعي", severity: "high" },
  external_link: { label: "رابط خارجي", reason: "مشاركة رابط خارجي", severity: "high" },
  address_sharing: { label: "مشاركة عنوان", reason: "مشاركة عنوان سكن أو موقع", severity: "high" },
  harassment: { label: "تحرش أو مضايقة", reason: "تحرش أو مضايقة", severity: "critical" },
  coded_message: { label: "رسالة مشفرة", reason: "محاولة تمرير بيانات بطريقة مموهة", severity: "critical" },
};

const FALLBACK: ViolationMeta = { label: "مخالفة", reason: "مخالفة لسياسات المنصة", severity: "medium" };

export const metaFor = (type: string | null | undefined): ViolationMeta =>
  (type && VIOLATION_META[type]) || FALLBACK;

export const severityOf = (type: string | null | undefined): ViolationSeverity => metaFor(type).severity;

export const SEVERITY_LABELS: Record<ViolationSeverity, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  critical: "حرجة",
};

export const SEVERITY_ORDER: Record<ViolationSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export const SOURCE_LABELS: Record<string, string> = {
  chat: "الدردشة",
  voice: "الصوت",
  phone_call: "المكالمة الهاتفية",
  call: "المكالمة الهاتفية",
  recording: "تسجيل الجلسة",
  session: "الجلسة",
};

export interface ViolationFilters {
  severity: ViolationSeverity | "all";
  type: string; // "all" or a violation_type
  source: string; // "all" or a source
}

export const DEFAULT_FILTERS: ViolationFilters = { severity: "all", type: "all", source: "all" };

export function applyViolationFilters<T extends { violation_type?: string | null; source?: string | null }>(
  items: T[],
  f: ViolationFilters,
): T[] {
  return items.filter((v) => {
    if (f.severity !== "all" && severityOf(v.violation_type) !== f.severity) return false;
    if (f.type !== "all" && (v.violation_type || "") !== f.type) return false;
    if (f.source !== "all" && (v.source || "") !== f.source) return false;
    return true;
  });
}

// Highest severity first, then newest first.
export function sortBySeverityThenDate<T extends { violation_type?: string | null; created_at?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const d = SEVERITY_ORDER[severityOf(b.violation_type)] - SEVERITY_ORDER[severityOf(a.violation_type)];
    if (d !== 0) return d;
    return (b.created_at || "").localeCompare(a.created_at || "");
  });
}
