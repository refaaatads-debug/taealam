// Stored session report (sessions.ai_report) as shown under a recorded session.
// Only measured values are shown. The old formula score and the hardcoded quality are never shown.

export interface StoredReportView {
  status: "insufficient" | "ready";
  durationMinutes?: number;
  teacherSpeakingMinutes?: number;
  studentSpeakingMinutes?: number;
  silenceMinutes?: number;
  messages?: number;
  questions?: number;
  violations?: number;
  summary?: string;
  topics: string[];
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

export function parseStoredReport(aiReport: string | null | undefined): StoredReportView {
  const insufficient: StoredReportView = { status: "insufficient", topics: [] };
  if (!aiReport) return insufficient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: Record<string, any> | null;
  try { parsed = JSON.parse(aiReport); } catch { return insufficient; }
  if (!parsed || typeof parsed !== "object") return insufficient;
  // The report function marks reports built without enough data as "none".
  if (parsed.data_level === "none" || parsed.data_level === undefined) return insufficient;

  const raw = parsed.raw_stats ?? {};
  const teacher = num(raw.teacher_speaking_minutes);
  const student = num(raw.student_speaking_minutes);
  const speechKnown = (teacher ?? 0) + (student ?? 0) > 0;
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  return {
    status: "ready",
    durationMinutes: num(raw.duration_minutes),
    // Speaking and silence are only shown when speech was actually measured.
    teacherSpeakingMinutes: speechKnown ? teacher : undefined,
    studentSpeakingMinutes: speechKnown ? student : undefined,
    silenceMinutes: speechKnown ? num(raw.silence_minutes) : undefined,
    messages: num(raw.total_messages),
    questions: num(raw.questions_detected),
    violations: num(raw.violations_count),
    summary: summary || undefined,
    topics: Array.isArray(parsed.extracted_topics) ? parsed.extracted_topics.filter((t: unknown) => typeof t === "string") : [],
  };
}
