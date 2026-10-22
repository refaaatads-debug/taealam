export interface MinuteBalanceNotification {
  title: string;
  body: string;
  type: "subscription_warning";
}

export function getMinuteBalanceNotification(remainingMinutes: number): MinuteBalanceNotification | null {
  if (remainingMinutes > 30) return null;
  if (remainingMinutes <= 0) {
    return {
      title: "نفدت دقائق الباقة",
      body: "استهلكت دقائق الباقة المتاحة. أضف رصيد دقائق للمتابعة.",
      type: "subscription_warning",
    };
  }
  return {
    title: "رصيد الدقائق منخفض",
    body: `متبقي ${remainingMinutes} دقيقة فقط. أضف رصيدًا عند الحاجة.`,
    type: "subscription_warning",
  };
}
