const bookingErrorTranslations: Array<[string, string]> = [
  [
    "already has an in-person lesson",
    "لا يمكن إرسال الطلب في هذا الموعد؛ توجد حصة حضورية متعارضة لك أو للمعلم المختار. اختر موعدًا آخر.",
  ],
  [
    "already has an online lesson",
    "لا يمكن إرسال الطلب في هذا الموعد؛ توجد حصة عن بُعد متعارضة لك أو للمعلم المختار. اختر موعدًا آخر.",
  ],
  [
    "teacher already has a lesson at that time",
    "لا يمكن قبول الحصة؛ لدى المعلم حصة أخرى في هذا الموعد. اختر موعدًا مختلفًا.",
  ],
  [
    "teacher has a booking or travel-time conflict",
    "لا يمكن قبول الطلب بسبب تعارض موعد الحصة أو وقت التنقل.",
  ],
  [
    "in-person service is unavailable in this city",
    "الحصص الحضورية غير متاحة حاليًا في المدينة المحددة.",
  ],
  [
    "teacher profile must be approved with a complete service location",
    "تعذر تفعيل استقبال الطلبات. يجب اعتماد ملف المعلم الأساسي وحفظ موقع الخدمة ونطاقه من الملف الشخصي.",
  ],
  [
    "in-person pilot is not enabled",
    "خدمة الحصص الحضورية غير مفعّلة لهذا الحساب.",
  ],
  [
    "address is not available to this student",
    "العنوان المحدد غير متاح لهذا الحساب. حدّث عنوانك ثم أعد المحاولة.",
  ],
  [
    "choose a future lesson time",
    "اختر موعدًا مستقبليًا للحصة.",
  ],
];

export function arabicBookingError(
  error: unknown,
  fallback = "تعذر إكمال الطلب. حاول مرة أخرى."
): string {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : "";

  const normalized = message.toLowerCase();
  const translation = bookingErrorTranslations.find(([key]) => normalized.includes(key));
  if (translation) return translation[1];
  if (/[\u0600-\u06FF]/.test(message)) return message;
  return fallback;
}
