import { describe, expect, it } from "vitest";
import { summarizeWithdrawalAllocations } from "../withdrawalAllocationBreakdown";

describe("summarizeWithdrawalAllocations", () => {
  it("separates monthly earnings from bonuses and groups monthly sources", () => {
    const result = summarizeWithdrawalAllocations([
      {
        withdrawal_request_id: "request-1",
        amount: "100",
        teacher_earnings: { earning_type: "monthly_transfer", month: "2026-10" },
      },
      {
        withdrawal_request_id: "request-1",
        amount: 50,
        teacher_earnings: { earning_type: "bonus", month: "2026-10" },
      },
      {
        withdrawal_request_id: "request-1",
        amount: 50,
        teacher_earnings: { earning_type: "monthly_transfer", month: "2026-11", rollover_source_month: "2026-09" },
      },
    ]);

    expect(result["request-1"]).toEqual({
      monthly: 150,
      bonus: 50,
      monthlyByMonth: { "2026-10": 100, "2026-09": 50 },
    });
  });

  it("supports array-shaped relationships and keeps each request separate", () => {
    const result = summarizeWithdrawalAllocations([
      {
        withdrawal_request_id: "request-1",
        amount: 25,
        teacher_earnings: [{ earning_type: "bonus", month: "2026-10" }],
      },
      {
        withdrawal_request_id: "request-2",
        amount: 80,
        teacher_earnings: { earning_type: "monthly_transfer", month: "2026-10" },
      },
    ]);

    expect(result["request-1"]).toEqual({ monthly: 0, bonus: 25, monthlyByMonth: {} });
    expect(result["request-2"]).toEqual({
      monthly: 80,
      bonus: 0,
      monthlyByMonth: { "2026-10": 80 },
    });
  });
});
