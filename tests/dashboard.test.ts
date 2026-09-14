import { describe, expect, it } from "vitest";
import { buildDashboardSummary } from "@/lib/analytics/dashboard";
import type { BankTransaction } from "@/types/banking";

const transaction = (id: string, amount: number, date: string, merchant = "Starbucks"): BankTransaction => ({
  providerTransactionId: id, providerAccountId: "a1", merchantName: merchant, description: merchant,
  amount, currency: "EUR", transactionDate: `${date}T12:00:00Z`, pending: false
});

describe("dashboard calculations", () => {
  it("returns a safe empty state when there are no transactions", () => {
    expect(buildDashboardSummary([], new Date("2026-08-23"), 100)).toMatchObject({
      totalSpent: 0, previousMonthSpent: 0, budgetRemaining: 100, byCategory: [], topMerchants: [], latest: []
    });
  });

  it("counts expenses only and compares months", () => {
    const result = buildDashboardSummary([
      transaction("1", -20, "2026-08-02"), transaction("2", -30, "2026-08-09"),
      transaction("3", 2000, "2026-08-01", "Salary"), transaction("4", -40, "2026-07-03")
    ], new Date("2026-08-23"), 100);
    expect(result.totalSpent).toBe(50);
    expect(result.previousMonthSpent).toBe(40);
    expect(result.budgetRemaining).toBe(50);
  });
});
