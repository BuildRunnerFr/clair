import type { CategoryResult } from "@/types/banking";
import type { SpendingContext } from "@/types/analytics";

export interface AICategorizationInput {
  merchant: string;
  description: string;
  amount: number;
  currency: string;
  existingCategories: string[];
}

export interface AIProvider {
  categorizeTransaction(transaction: AICategorizationInput): Promise<CategoryResult>;
  analyzeSpending?(context: SpendingContext, question: string): Promise<string>;
}
