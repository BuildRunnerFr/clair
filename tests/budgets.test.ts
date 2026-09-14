import { describe, expect, it } from "vitest";
import { calculateBudgetStatus } from "@/lib/analytics/month";
import { InMemoryBudgetRepository } from "@/lib/db/budget-repository";
import { getAvailableBudgetCategories } from "@/lib/categories/reference";

describe("budgets", () => {
  it("creates, updates and deletes a budget", async () => {
    const repository = new InMemoryBudgetRepository();
    const created = await repository.upsertBudget("u1", "Food", "EUR", 300);
    const updated = await repository.upsertBudget("u1", "Food", "EUR", 450);
    expect(updated.id).toBe(created.id);
    expect(repository.list("u1")).toHaveLength(1);
    expect(repository.list("u1")[0].monthlyLimit).toBe(450);
    await repository.deleteBudget("u1", created.id);
    expect(repository.list("u1")).toEqual([]);
  });

  it("offers reference categories without transactions and hides existing budgets", () => {
    const available = getAvailableBudgetCategories(["Housing", "Groceries"], ["Housing"]);
    expect(available).toContain("Transport");
    expect(available).toContain("Groceries");
    expect(available).not.toContain("Housing");
  });

  it("shows a full remaining budget before the first transaction", () => {
    expect(calculateBudgetStatus(500, 0)).toEqual({ limit: 500, spent: 0, remaining: 500, percentageUsed: 0, level: "ok" });
  });

  it("separates budgets by currency and user", async () => {
    const repository = new InMemoryBudgetRepository();
    await repository.upsertBudget("u1", "Food", "EUR", 300);
    await repository.upsertBudget("u1", "Food", "MYR", 1200);
    await repository.upsertBudget("u2", "Food", "EUR", 999);
    expect(repository.list("u1").map((item) => [item.currency, item.monthlyLimit])).toEqual([["EUR", 300], ["MYR", 1200]]);
    expect(repository.list("u2")).toHaveLength(1);
  });

  it("creates a GBP budget independently from EUR without transactions", async () => {
    const repository = new InMemoryBudgetRepository();
    await repository.upsertBudget("u1", "Transport", "GBP", 500);
    await repository.upsertBudget("u1", "Transport", "EUR", 300);
    expect(repository.list("u1").map((item) => [item.currency, item.monthlyLimit])).toEqual([["GBP", 500], ["EUR", 300]]);
    expect(calculateBudgetStatus(500, 0)).toMatchObject({ spent: 0, remaining: 500 });
  });

  it("detects warning and exceeded budgets deterministically", () => {
    expect(calculateBudgetStatus(100, 85)).toMatchObject({ remaining: 15, percentageUsed: 85, level: "warning" });
    expect(calculateBudgetStatus(100, 125)).toMatchObject({ remaining: -25, percentageUsed: 125, level: "over" });
  });
});
