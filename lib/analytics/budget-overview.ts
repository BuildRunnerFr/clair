import type { BudgetStatus } from "@/types/database";
export function budgetOverview(rows: BudgetStatus[]) {
  const configured = rows.filter(row => row.budgetId && row.monthlyLimit !== null);
  const unbudgeted = rows.filter(row => !row.budgetId && row.spent > 0);
  const limit = configured.reduce((sum, row) => sum + row.monthlyLimit!, 0);
  const spent = configured.reduce((sum, row) => sum + row.spent, 0);
  return { configured: configured.sort((a,b) => (b.percentageUsed ?? 0) - (a.percentageUsed ?? 0)), unbudgeted,
    limit, spent, remaining: Math.round((limit - spent) * 100) / 100,
    exceeded: configured.filter(row => row.spent > row.monthlyLimit!).length };
}
