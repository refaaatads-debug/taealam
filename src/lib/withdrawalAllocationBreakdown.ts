export type WithdrawalAllocationSummary = {
  monthly: number;
  bonus: number;
  monthlyByMonth: Record<string, number>;
};

type AllocationRow = {
  withdrawal_request_id?: string | null;
  amount?: number | string | null;
  teacher_earnings?: {
    earning_type?: string | null;
    month?: string | null;
    rollover_source_month?: string | null;
  } | Array<{
    earning_type?: string | null;
    month?: string | null;
    rollover_source_month?: string | null;
  }> | null;
};

export function summarizeWithdrawalAllocations(rows: AllocationRow[]) {
  const summaries: Record<string, WithdrawalAllocationSummary> = {};

  for (const row of rows) {
    const requestId = row.withdrawal_request_id;
    const earning = Array.isArray(row.teacher_earnings)
      ? row.teacher_earnings[0]
      : row.teacher_earnings;
    if (!requestId || !earning) continue;

    const summary = summaries[requestId] ??= { monthly: 0, bonus: 0, monthlyByMonth: {} };
    const amount = Number(row.amount) || 0;
    if (earning.earning_type === "bonus") {
      summary.bonus += amount;
      continue;
    }

    summary.monthly += amount;
    const month = earning.rollover_source_month || earning.month || "—";
    summary.monthlyByMonth[month] = (summary.monthlyByMonth[month] || 0) + amount;
  }

  return summaries;
}
