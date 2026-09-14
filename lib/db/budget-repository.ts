import type { Budget } from "@/types/database";

export interface BudgetRepository {
  upsertBudget(userId: string, category: string, currency: string, monthlyLimit: number): Promise<Budget>;
  deleteBudget(userId: string, budgetId: string): Promise<void>;
}

export class InMemoryBudgetRepository implements BudgetRepository {
  private readonly budgets: Budget[] = [];

  async upsertBudget(userId: string, category: string, currency: string, monthlyLimit: number) {
    const existing = this.budgets.find((item) => item.userId === userId && item.category === category && item.currency === currency);
    const timestamp = new Date().toISOString();
    if (existing) {
      existing.monthlyLimit = monthlyLimit;
      existing.updatedAt = timestamp;
      return { ...existing };
    }
    const budget: Budget = { id: `budget-${this.budgets.length + 1}`, userId, category, currency, monthlyLimit, createdAt: timestamp, updatedAt: timestamp };
    this.budgets.push(budget);
    return { ...budget };
  }

  async deleteBudget(userId: string, budgetId: string) {
    const index = this.budgets.findIndex((item) => item.id === budgetId && item.userId === userId);
    if (index >= 0) this.budgets.splice(index, 1);
  }

  list(userId: string) { return this.budgets.filter((item) => item.userId === userId).map((item) => ({ ...item })); }
}
