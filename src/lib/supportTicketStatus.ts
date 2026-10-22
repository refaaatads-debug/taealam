export type NormalizedSupportStatus = "open" | "in_progress" | "closed" | "unknown";

export function normalizeSupportTicketStatus(status: unknown): NormalizedSupportStatus {
  const value = String(status ?? "").trim().toLowerCase();
  if (value === "open" || value === "مفتوحة" || value === "مفتوح") return "open";
  if (value === "in_progress" || value === "in progress" || value === "قيد المعالجة") return "in_progress";
  if (value === "closed" || value === "resolved" || value === "مغلقة" || value === "مغلق" || value === "منتهية") return "closed";
  return "unknown";
}
