/**
 * Unified notification templates for booking/session lifecycle events.
 * Single source of truth — all titles & bodies must come from here so the
 * wording stays consistent across the app (Arabic, RTL, user-facing tone).
 *
 * Convention: each event is a pair { title, body }.
 *  - title: short, prefixed with a single relevant emoji.
 *  - body:  full sentence in Arabic, no emoji at the start, includes context.
 *  - type:  used in DB to drive sound + routing (see useNotificationSound).
 */

const formatDateAr = (iso: string | Date) => {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
};

const formatDateTimeAr = (iso: string | Date) => {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${d.toLocaleDateString("ar-SA", { month: "long", day: "numeric" })} - ${d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`;
};

export const notificationTemplates = {
  // ─── طلب حجز جديد (طالب → معلم) ──────────────────────────────
  bookingRequest: (params: {
    count: number;
    subjectName: string;
    stage?: string;
    slotsText: string;
  }) => ({
    title: `📚 طلب حجز جديد — ${params.subjectName}${params.stage ? ` (${params.stage})` : ""}`,
    body: `لديك ${params.count > 1 ? `${params.count} طلبات` : "طلب"} حصة في ${params.subjectName}: ${params.slotsText}. سارع بالقبول قبل أن يختار الطالب معلمًا آخر.`,
    type: "booking_request" as const,
  }),

  // ─── تأكيد قبول الحجز (معلم → طالب) ──────────────────────────
  bookingConfirmed: (params: {
    teacherName: string;
    subjectName: string;
    count?: number;
  }) => ({
    title: params.count && params.count > 1
      ? `✅ تم تأكيد ${params.count} حصص`
      : "✅ تم تأكيد الحجز",
    body: params.count && params.count > 1
      ? `أكّد المعلم ${params.teacherName} جميع حصصك في ${params.subjectName}. راجع جدولك للاطلاع على المواعيد.`
      : `أكّد المعلم ${params.teacherName} حجز حصة ${params.subjectName}. جهّز نفسك للحصة في موعدها.`,
    type: "booking_confirmed" as const,
  }),

  // ─── رفض الحجز (معلم → طالب) ─────────────────────────────────
  bookingRejected: (params: {
    teacherName: string;
    subjectName: string;
    reason?: string;
  }) => ({
    title: "❌ تم رفض الحجز",
    body: `اعتذر المعلم ${params.teacherName} عن قبول حصة ${params.subjectName}.${params.reason ? ` السبب: ${params.reason}` : " يمكنك البحث عن معلم آخر متاح."}`,
    type: "booking_rejected" as const,
  }),

  // ─── إلغاء من الطالب (طالب → معلم) ───────────────────────────
  bookingCancelledByStudent: (params: {
    subjectName: string;
    scheduledAt: string | Date;
  }) => ({
    title: "🗑️ ألغى الطالب الحصة",
    body: `قام الطالب بإلغاء حصة ${params.subjectName} المقررة في ${formatDateAr(params.scheduledAt)}.`,
    type: "booking_cancelled" as const,
  }),

  // ─── إلغاء من المعلم (معلم → طالب) ──────────────────────────
  bookingCancelledByTeacher: (params: {
    teacherName: string;
    subjectName?: string;
    reason: string;
  }) => ({
    title: "🗑️ تم إلغاء حصتك",
    body: `قام المعلم ${params.teacherName} بإلغاء${params.subjectName ? ` حصة ${params.subjectName}` : " الحصة"}. السبب: ${params.reason}`,
    type: "booking_cancelled" as const,
  }),

  // ─── تذكير قبل الحصة بساعة ──────────────────────────────────
  sessionReminder: (params: {
    subjectName: string;
    otherName: string;
    scheduledAt?: string | Date;
  }) => ({
    title: "⏰ تذكير: حصتك بعد ساعة",
    body: `حصة ${params.subjectName} مع ${params.otherName}${params.scheduledAt ? ` في ${formatDateTimeAr(params.scheduledAt)}` : ""}.`,
    type: "session_reminder" as const,
  }),

  // ─── بدء الحصة (معلم → طالب) ────────────────────────────────
  sessionStarted: (params: { teacherName: string; subjectName?: string }) => ({
    title: "🎓 بدأت الحصة الآن",
    body: `بدأ المعلم ${params.teacherName}${params.subjectName ? ` حصة ${params.subjectName}` : " الحصة"}. انضم فورًا حتى لا تفوّت شيئًا.`,
    type: "session_started" as const,
  }),

  // ─── اكتمال الحصة - للطالب ──────────────────────────────────
  sessionCompletedStudent: (params: {
    durationMinutes: number;
    remainingMinutes: number;
  }) => ({
    title: "🏁 اكتملت الحصة",
    body: `انتهت الحصة بنجاح بعد ${params.durationMinutes} دقيقة. الرصيد المتبقي في باقتك: ${params.remainingMinutes} دقيقة.`,
    type: "session_completed" as const,
  }),

  // ─── اكتمال الحصة - للمعلم (إيداع أرباح) ───────────────────
  sessionCompletedTeacher: (params: {
    durationMinutes: number;
    earning: number;
  }) => ({
    title: "🏁 اكتملت الحصة وأُضيفت الأرباح",
    body: `انتهت الحصة بعد ${params.durationMinutes} دقيقة، وتمت إضافة ${params.earning.toFixed(1)} ر.س إلى رصيدك.`,
    type: "session_completed" as const,
  }),

  // ─── طلب جلسة فورية (طالب → معلم) ──────────────────────────
  instantSessionFromStudent: () => ({
    title: "📞 طلب جلسة فورية من طالب",
    body: "طالب يريد بدء جلسة فورية معك الآن. انضم لقبول الطلب أو رفضه.",
    type: "session_request" as const,
  }),

  // ─── طلب جلسة فورية (معلم → طالب) ──────────────────────────
  instantSessionFromTeacher: (params: { teacherName: string }) => ({
    title: "📞 طلب جلسة فورية من المعلم",
    body: `المعلم ${params.teacherName} يريد بدء جلسة فورية معك الآن. انضم للقبول.`,
    type: "session_request" as const,
  }),

  // ─── قبول الطلب الفوري ─────────────────────────────────────
  instantSessionAccepted: () => ({
    title: "✅ قُبل طلب الجلسة الفورية",
    body: "قَبِل الطالب الجلسة الفورية. يمكنك بدء الحصة الآن.",
    type: "session_request" as const,
  }),

  // ─── رفض الطلب الفوري ─────────────────────────────────────
  instantSessionRejected: () => ({
    title: "❌ رُفض طلب الجلسة الفورية",
    body: "اعتذر الطالب عن الجلسة الفورية في الوقت الحالي.",
    type: "session_request" as const,
  }),
};

export type NotificationTemplate = ReturnType<
  (typeof notificationTemplates)[keyof typeof notificationTemplates]
>;
