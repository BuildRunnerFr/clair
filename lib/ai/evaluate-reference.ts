import type { AIProvider } from "./ai-provider";
import type { CategorizationReferenceCase } from "./reference-dataset";
import { CATEGORY_NAMES } from "@/lib/categories/taxonomy";

export interface CategorizationEvaluation {
  total: number;
  completed: number;
  errors: number;
  categoryAccuracy: number;
  exactAccuracy: number;
  autoApplied: number;
  autoApplyCategoryPrecision: number;
  rulesEligible: number;
  rulesEligibleExactPrecision: number;
  averageConfidence: number;
  durationMs: number;
  failedCaseIds: string[];
}

export async function evaluateCategorizationReference(
  provider: AIProvider,
  cases: readonly CategorizationReferenceCase[],
  concurrency = 3
): Promise<CategorizationEvaluation> {
  const startedAt = Date.now();
  const results: Array<{ item: CategorizationReferenceCase; category?: string; subcategory?: string; confidence?: number; error?: true }> = [];
  let cursor = 0;
  async function worker() {
    while (cursor < cases.length) {
      const item = cases[cursor++];
      try {
        const answer = await provider.categorizeTransaction({
          merchant: item.merchant,
          description: item.description,
          amount: item.amount,
          currency: item.currency,
          existingCategories: CATEGORY_NAMES.filter((category) => category !== "Uncategorized")
        });
        results.push({ item, category: answer.category, subcategory: answer.subcategory, confidence: answer.confidence ?? 0 });
      } catch {
        results.push({ item, error: true });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, cases.length || 1)) }, worker));

  const completed = results.filter((result) => !result.error);
  const categoryCorrect = completed.filter((result) => result.category === result.item.expectedCategory);
  const exactCorrect = categoryCorrect.filter((result) => result.subcategory === result.item.expectedSubcategory);
  const autoApplied = completed.filter((result) => (result.confidence ?? 0) >= 0.7);
  const rulesEligible = completed.filter((result) => (result.confidence ?? 0) >= 0.9);
  const ratio = (numerator: number, denominator: number) => denominator === 0 ? 0 : numerator / denominator;

  return {
    total: cases.length,
    completed: completed.length,
    errors: results.length - completed.length,
    categoryAccuracy: ratio(categoryCorrect.length, completed.length),
    exactAccuracy: ratio(exactCorrect.length, completed.length),
    autoApplied: autoApplied.length,
    autoApplyCategoryPrecision: ratio(autoApplied.filter((result) => result.category === result.item.expectedCategory).length, autoApplied.length),
    rulesEligible: rulesEligible.length,
    rulesEligibleExactPrecision: ratio(rulesEligible.filter((result) => result.category === result.item.expectedCategory && result.subcategory === result.item.expectedSubcategory).length, rulesEligible.length),
    averageConfidence: ratio(completed.reduce((sum, result) => sum + (result.confidence ?? 0), 0), completed.length),
    durationMs: Date.now() - startedAt,
    failedCaseIds: results.filter((result) => result.error || result.category !== result.item.expectedCategory || result.subcategory !== result.item.expectedSubcategory).map((result) => result.item.id)
  };
}
