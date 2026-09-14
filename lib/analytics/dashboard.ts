import type { DashboardSummary } from "@/types/analytics";
import type { BankTransaction, NormalizedTransaction } from "@/types/banking";
import { categorizeMerchant, normalizeMerchant } from "@/lib/rules/categorize";

export function buildDashboardSummary(
  transactions: BankTransaction[],
  referenceDate: Date,
  monthlyBudget = 2500,
  filters: { currency?: string; accountId?: string; category?: string } = {}
): DashboardSummary {
  const normalized: NormalizedTransaction[] = transactions.map((transaction) => {
    const merchantName = normalizeMerchant(transaction.merchantName || transaction.description);
    const result = categorizeMerchant(merchantName);
    return { ...transaction, merchantName, category: result.category, subcategory: result.subcategory };
  });
  const month = referenceDate.getUTCMonth();
  const year = referenceDate.getUTCFullYear();
  const previous = new Date(Date.UTC(year, month - 1, 1));
  const acceptsFilters = (transaction: NormalizedTransaction) =>
    (!filters.currency || transaction.currency === filters.currency) &&
    (!filters.accountId || transaction.providerAccountId === filters.accountId) &&
    (!filters.category || transaction.category === filters.category);
  const expenses = normalized.filter((transaction) => transaction.amount < 0 && acceptsFilters(transaction));
  const current = expenses.filter((transaction) => {
    const date = new Date(transaction.transactionDate);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month;
  });
  const prior = expenses.filter((transaction) => {
    const date = new Date(transaction.transactionDate);
    return date.getUTCFullYear() === previous.getUTCFullYear() && date.getUTCMonth() === previous.getUTCMonth();
  });
  const sum = (items: NormalizedTransaction[]) => items.reduce((total, item) => total + Math.abs(item.amount), 0);
  const grouped = (items: NormalizedTransaction[], key: (item: NormalizedTransaction) => string) =>
    [...items.reduce((map, item) => map.set(key(item), (map.get(key(item)) ?? 0) + Math.abs(item.amount)), new Map<string, number>())]
      .map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  const totalSpent = sum(current);

  return {
    totalSpent,
    previousMonthSpent: sum(prior),
    budgetRemaining: monthlyBudget - totalSpent,
    byCategory: grouped(current, (item) => item.category),
    topMerchants: grouped(current, (item) => item.merchantName).slice(0, 5),
    latest: current.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)).slice(0, 6)
  };
}
