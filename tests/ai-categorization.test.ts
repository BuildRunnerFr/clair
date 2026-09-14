import { describe, expect, it, vi } from "vitest";
import { categorizeTransactions } from "@/lib/ai/categorization-pipeline";
import { recategorizeHistoricalTransactions } from "@/lib/ai/recategorize";
import { categorizeMerchant } from "@/lib/rules/categorize";
import { InMemoryTransactionRepository } from "@/lib/db/transaction-repository";
import type { AIProvider } from "@/lib/ai/ai-provider";
import type { StoredTransaction } from "@/types/database";

const transaction = (merchant: string, currency = "GBP", id = merchant): StoredTransaction => ({ userId: "u1", accountId: `a-${currency}`, providerTransactionId: id, merchantName: merchant, description: merchant, amount: -10, currency, transactionDate: "2026-08-20T00:00:00Z", category: "Uncategorized", subcategory: "Other", categorySource: "uncategorized", pending: false });
const ai = (confidence: number, category = "Utilities", subcategory = "Electricity"): AIProvider => ({ categorizeTransaction: vi.fn(async () => ({ category, subcategory, confidence, reason: "Known supplier", source: "ai" as const })) });

describe("AI categorization pipeline", () => {
  it("prioritizes manual, then remembered AI rules, before defaults", () => {
    const rules = [
      { userId: "u1", merchantPattern: "GRAB", normalizedMerchant: "GRAB", category: "Transport", subcategory: "Taxi", source: "ai" as const, confidence: 0.95 },
      { userId: "u1", merchantPattern: "GRAB", normalizedMerchant: "GRAB", category: "Transport", subcategory: "Public Transport", source: "manual" as const, confidence: 1 }
    ];
    expect(categorizeMerchant("GRAB", rules)).toMatchObject({ subcategory: "Public Transport", source: "manual" });
    expect(categorizeMerchant("GRAB", rules.slice(0, 1))).toMatchObject({ subcategory: "Taxi", source: "ai" });
    expect(categorizeMerchant("GRAB", [])).toMatchObject({ subcategory: "Ride Hailing", source: "default" });
  });

  it("calls AI only for an unknown merchant", async () => {
    const provider = ai(0.95);
    await categorizeTransactions([transaction("STARBUCKS"), transaction("OVO ENERGY")], [], provider);
    expect(provider.categorizeTransaction).toHaveBeenCalledTimes(1);
  });

  it("memorizes high confidence, applies intermediate confidence, and rejects low confidence", async () => {
    const high = await categorizeTransactions([transaction("OVO ENERGY")], [], ai(0.95));
    expect(high.transactions[0].category).toBe("Utilities");
    expect(high.summary.rememberedRules).toHaveLength(1);
    const medium = await categorizeTransactions([transaction("MYSTERY MEDIUM")], [], ai(0.8, "Shopping", "Other"));
    expect(medium.transactions[0].category).toBe("Shopping");
    expect(medium.summary.rememberedRules).toHaveLength(0);
    const low = await categorizeTransactions([transaction("MYSTERY LOW")], [], ai(0.4));
    expect(low.transactions[0].category).toBe("Uncategorized");
  });

  it("groups fifty occurrences of one merchant into one AI classification", async () => {
    const provider = ai(0.95);
    const currencies = ["GBP", "EUR", "MYR"];
    const rows = Array.from({ length: 50 }, (_, index) => transaction("OVO ENERGY LTD", currencies[index % currencies.length]!, String(index)));
    const result = await categorizeTransactions(rows, [], provider);
    expect(provider.categorizeTransaction).toHaveBeenCalledTimes(1);
    expect(result.summary.byAI).toBe(50);
    expect(new Set(result.transactions.map((row) => row.currency))).toEqual(new Set(["GBP", "EUR", "MYR"]));
  });

  it("keeps banking data uncategorized when AI fails", async () => {
    const provider: AIProvider = { categorizeTransaction: vi.fn(async () => { throw new Error("timeout"); }) };
    const result = await categorizeTransactions([transaction("UNKNOWN")], [], provider);
    expect(result.transactions[0].category).toBe("Uncategorized");
    expect(result.summary.aiErrors).toBe(1);
  });

  it("recategorizes history and lets a manual correction override an AI rule", async () => {
    const repository = new InMemoryTransactionRepository([], [], [transaction("OVO ENERGY")]);
    const summary = await recategorizeHistoricalTransactions("u1", repository, ai(0.95));
    expect(summary).toMatchObject({ categorizedByAI: 1, remaining: 0 });
    expect(repository.all()[0].category).toBe("Utilities");
    await repository.upsertManualMerchantRule({ userId: "u1", merchantPattern: "OVO ENERGY", normalizedMerchant: "OVO ENERGY", category: "Utilities", subcategory: "Gas", source: "manual", confidence: 1 });
    expect(categorizeMerchant("OVO ENERGY", await repository.findMerchantRules("u1"))).toMatchObject({ subcategory: "Gas", source: "manual" });
  });

  it("reuses a remembered AI rule on the next sync without another AI call", async () => {
    const repository = new InMemoryTransactionRepository([], [], [transaction("GENERIC ENERGY SHOP", "GBP", "first")]);
    const provider = ai(0.96);
    const first = await recategorizeHistoricalTransactions("u1", repository, provider);
    expect(first).toMatchObject({ merchantsSentToAI: 1, rulesCreated: 1, highConfidence: 1 });
    expect(provider.categorizeTransaction).toHaveBeenCalledTimes(1);

    const next = transaction("GENERIC ENERGY SHOP", "GBP", "second");
    const result = await categorizeTransactions([next], await repository.findMerchantRules("u1"), provider);
    expect(result.transactions[0]).toMatchObject({ category: "Utilities", categorySource: "ai" });
    expect(result.summary).toMatchObject({ byRule: 1, aiCalls: 0, merchantsCoveredByRule: 1 });
    expect(provider.categorizeTransaction).toHaveBeenCalledTimes(1);
  });

  it("reports merchant-level confidence bands without exposing duplicate calls", async () => {
    const provider = ai(0.8, "Shopping", "Other");
    const result = await categorizeTransactions([transaction("UNKNOWN GROUP", "GBP", "one"), transaction("UNKNOWN GROUP", "GBP", "two")], [], provider);
    expect(result.summary).toMatchObject({ uniqueMerchants: 1, aiCalls: 1, highConfidence: 0, intermediateConfidence: 1, lowConfidence: 0 });
    expect(result.summary.merchantResults).toEqual([expect.objectContaining({ normalizedMerchant: "UNKNOWN GROUP", transactionsCount: 2, previousCategory: "Uncategorized", newCategory: "Shopping", source: "ai", confidence: 0.8, ruleCreated: false })]);
  });

  it("only deletes AI rules and can reset their merchant transactions", async () => {
    const repository = new InMemoryTransactionRepository([], [
      { userId: "u1", merchantPattern: "AI SHOP", normalizedMerchant: "AI SHOP", category: "Shopping", subcategory: "Other", source: "ai", confidence: 0.95 },
      { userId: "u1", merchantPattern: "MANUAL SHOP", normalizedMerchant: "MANUAL SHOP", category: "Shopping", subcategory: "Other", source: "manual", confidence: 1 }
    ], [transaction("AI SHOP"), transaction("MANUAL SHOP", "GBP", "manual")]);
    await repository.updateMerchantClassification("u1", "AI SHOP", "Shopping", "Other");
    expect(await repository.deleteAiMerchantRule("u1", "AI SHOP")).toBe(true);
    expect(await repository.deleteAiMerchantRule("u1", "MANUAL SHOP")).toBe(false);
    expect(await repository.resetMerchantClassification("u1", "AI SHOP")).toBe(1);
    expect(repository.all()[0]).toMatchObject({ category: "Uncategorized", categorySource: "uncategorized", categoryConfidence: null });
  });
});
