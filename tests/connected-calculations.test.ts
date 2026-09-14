import { describe, expect, it, vi } from "vitest";
import { transactionTotals, displayedAmount } from "@/lib/transactions/amounts";
import { budgetOverview } from "@/lib/analytics/budget-overview";
import { getAvailableBudgetCategories } from "@/lib/categories/reference";
import { categorizeMerchant } from "@/lib/rules/categorize";
import { detectSubscriptions, isRecurringCurrent } from "@/lib/subscriptions/detect";
vi.mock("server-only", () => ({}));
import { SupabaseTransactionRepository } from "@/lib/db/supabase-transaction-repository";
import { SupabaseAnalyticsRepository } from "@/lib/db/supabase-analytics-repository";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

describe("montants affichés", () => {
  it("ne transforme jamais une conversion absente en euros", () => {
    const items = [
      { amount: -10, currency: "EUR", amountBase: -10, baseCurrency: "EUR" },
      { amount: -20, currency: "GBP", amountBase: null, baseCurrency: "EUR" },
      { amount: -30, currency: "GBP", amountBase: -35, baseCurrency: "EUR" },
      { amount: 8, currency: "EUR" }, { amount: -100, currency: "EUR", pending: true }
    ];
    expect(transactionTotals(items)).toEqual([{ currency: "EUR", spent: 45, received: 8, pending: 100 }, { currency: "GBP", spent: 20, received: 0, pending: 0 }]);
    expect(displayedAmount(items[1]!)).toEqual({ amount: -20, currency: "GBP" });
  });
  it("arrondit les additions de centimes", () => expect(transactionTotals([{ amount: -.1, currency: "EUR" }, { amount: -.2, currency: "EUR" }])[0]?.spent).toBe(.3));
});

describe("budgets", () => {
  it("ne soustrait pas les catégories sans limite du reste budgété", () => {
    const rows = [
      { budgetId: "1", category: "Groceries", currency: "EUR", monthlyLimit: 100, spent: 125, remaining: -25, percentageUsed: 125 },
      { budgetId: null, category: "Travel", currency: "EUR", monthlyLimit: null, spent: 500, remaining: null, percentageUsed: null }
    ];
    expect(budgetOverview(rows)).toMatchObject({ limit: 100, spent: 125, remaining: -25, exceeded: 1 });
    expect(getAvailableBudgetCategories(["Income", "Transfers", "Uncategorized"], [])).not.toEqual(expect.arrayContaining(["Income"]));
    for (const category of ["Income", "Transfers", "Uncategorized"]) expect(getAvailableBudgetCategories([category], [])).not.toContain(category);
  });
  it("demande toutes les devises d’origine pour le budget global", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await new SupabaseAnalyticsRepository({ rpc } as unknown as SupabaseClient<Database>).getBudgetStatus("2026-09", null);
    expect(rpc).toHaveBeenCalledWith("finance_budget_status", { p_month: "2026-09-01", p_currency: null });
  });
});

describe("catégorisation", () => {
  it("distingue les repas livrés des trajets Uber", () => {
    expect(categorizeMerchant("UBER EATS HELP.UBER.COM")).toMatchObject({ category: "Food & Drink", subcategory: "Delivery" });
    expect(categorizeMerchant("UBER *TRIP")).toMatchObject({ category: "Transport" });
  });
  it("une règle manuelle vide ou partielle ne classe pas tous les commerçants", () => {
    const rule = { userId: "u", merchantPattern: "SHOP", category: "Housing", subcategory: "Rent", source: "manual" as const };
    expect(categorizeMerchant("MY SHOP", [rule]).category).not.toBe("Housing");
    expect(categorizeMerchant("MY SHOP", [{ ...rule, merchantPattern: "" }]).category).not.toBe("Housing");
  });
});

describe("récurrences", () => {
  const rows = ["2026-07-05", "2026-08-05", "2026-09-05"].map(date => ({ merchantName: "STREAM", amount: -10, currency: "EUR", transactionDate: date }));
  it("ignore les opérations en attente, futures et les montants invalides", () => {
    const today = new Date("2026-09-06");
    expect(detectSubscriptions(rows, today)).toHaveLength(1);
    expect(detectSubscriptions(rows.map(row => ({ ...row, pending: true })), today)).toEqual([]);
    expect(detectSubscriptions(rows.map(row => ({ ...row, amount: NaN })), today)).toEqual([]);
    expect(detectSubscriptions(rows, new Date("2026-07-06"))).toEqual([]);
  });
  it("cesse de présenter comme actuelle une récurrence ancienne même sans synchronisation", () => {
    const subscription = detectSubscriptions(rows, new Date("2026-09-06"))[0]!;
    expect(isRecurringCurrent(subscription, new Date("2026-09-10"))).toBe(true);
    expect(isRecurringCurrent(subscription, new Date("2026-11-10"))).toBe(false);
  });
});

describe("recherche et historique", () => {
  it("transmet compte et statut en plus de l’utilisateur", async () => {
    const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.order.mockReturnValue(chain);
    chain.range.mockResolvedValue({ data: [], count: 0, error: null });
    const repository = new SupabaseTransactionRepository({ from: () => chain } as unknown as SupabaseClient<Database>);
    await repository.searchTransactions("user-1", { account: "account-2", status: "booked" });
    expect(chain.eq.mock.calls).toEqual(expect.arrayContaining([["user_id", "user-1"], ["account_id", "account-2"], ["pending", false]]));
  });
  it("lit au-delà de la limite Supabase de 1000 lignes", async () => {
    const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.order.mockReturnValue(chain);
    const row = { id: "test", amount: -10, amount_base: -10, category_confidence: null, fx_rate: null };
    chain.range.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, () => row), error: null }).mockResolvedValueOnce({ data: [row], error: null });
    const repository = new SupabaseTransactionRepository({ from: () => chain } as unknown as SupabaseClient<Database>);
    expect(await repository.getTransactions("u1")).toHaveLength(1001);
    expect(chain.range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });
});

it("compte les conversions manquantes dans le mois et pour le seul utilisateur", async () => {
  const chain = { select: vi.fn(), eq: vi.fn(), lt: vi.fn(), is: vi.fn(), gte: vi.fn() };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.is.mockReturnValue(chain); chain.gte.mockReturnValue(chain);
  chain.lt.mockImplementation((field: string) => field === "transaction_date" ? Promise.resolve({ count: 2, error: null }) : chain);
  const repository = new SupabaseAnalyticsRepository({ from: () => chain } as unknown as SupabaseClient<Database>);
  expect(await repository.getUnconvertedSpendingCount("u1", "2026-09")).toBe(2);
  expect(chain.eq.mock.calls).toEqual([["user_id", "u1"], ["pending", false]]);
  expect(chain.is).toHaveBeenCalledWith("amount_base", null);
  expect(chain.gte).toHaveBeenCalledWith("transaction_date", "2026-09-01T00:00:00.000Z");
  expect(chain.lt).toHaveBeenCalledWith("transaction_date", "2026-10-01T00:00:00.000Z");
});

it("totalise tous les résultats filtrés au-delà de la première page", async () => {
  const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), gte: vi.fn(), lt: vi.fn(), or: vi.fn() };
  for (const method of ["select", "eq", "order", "gte", "lt", "or"] as const) chain[method].mockReturnValue(chain);
  const row = { id: "test", amount: -1, amount_base: -1, currency: "EUR", base_currency: "EUR", pending: false };
  chain.range.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, () => row), error: null }).mockResolvedValueOnce({ data: [row], error: null });
  const repository = new SupabaseTransactionRepository({ from: () => chain } as unknown as SupabaseClient<Database>);
  expect(await repository.searchTotals("u1", { account: "a1", category: "Groceries", status: "booked", query: "SHOP", from: "2026-09-01", to: "2026-10-01" })).toEqual([{ currency: "EUR", spent: 1001, received: 0, pending: 0 }]);
  expect(chain.eq.mock.calls).toEqual(expect.arrayContaining([["user_id", "u1"], ["account_id", "a1"], ["category", "Groceries"], ["pending", false]]));
  expect(chain.or).toHaveBeenCalled();
});
