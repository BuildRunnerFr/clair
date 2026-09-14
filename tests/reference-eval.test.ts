import { describe, expect, it, vi } from "vitest";
import { evaluateCategorizationReference } from "@/lib/ai/evaluate-reference";
import type { AIProvider } from "@/lib/ai/ai-provider";

describe("categorization reference evaluator", () => {
  it("computes deterministic accuracy and confidence metrics", async () => {
    const categorizeTransaction = vi.fn<AIProvider["categorizeTransaction"]>()
      .mockResolvedValueOnce({ category: "Utilities", subcategory: "Electricity", confidence: 0.95, source: "ai" })
      .mockResolvedValueOnce({ category: "Shopping", subcategory: "Other", confidence: 0.8, source: "ai" });
    const result = await evaluateCategorizationReference({ categorizeTransaction }, [
      { id: "one", merchant: "OVO", description: "OVO", amount: -1, currency: "GBP", expectedCategory: "Utilities", expectedSubcategory: "Electricity" },
      { id: "two", merchant: "TESCO", description: "TESCO", amount: -1, currency: "GBP", expectedCategory: "Groceries", expectedSubcategory: "Supermarket" }
    ], 1);
    expect(result).toMatchObject({ total: 2, completed: 2, errors: 0, categoryAccuracy: 0.5, exactAccuracy: 0.5, autoApplied: 2, autoApplyCategoryPrecision: 0.5, rulesEligible: 1, rulesEligibleExactPrecision: 1, failedCaseIds: ["two"] });
    expect(categorizeTransaction).toHaveBeenCalledTimes(2);
  });

  it("counts provider failures without failing the evaluation", async () => {
    const provider: AIProvider = { categorizeTransaction: vi.fn().mockRejectedValue(new Error("offline")) };
    const result = await evaluateCategorizationReference(provider, [
      { id: "error", merchant: "X", description: "X", amount: -1, currency: "GBP", expectedCategory: "Other", expectedSubcategory: "Other" }
    ]);
    expect(result).toMatchObject({ total: 1, completed: 0, errors: 1, categoryAccuracy: 0, failedCaseIds: ["error"] });
  });
});
