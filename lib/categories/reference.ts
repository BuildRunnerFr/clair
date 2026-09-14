import { CATEGORY_NAMES } from "./taxonomy";

export const REFERENCE_CATEGORIES = CATEGORY_NAMES.filter((category) => !["Uncategorized", "Income", "Transfers"].includes(category));

export function getAvailableBudgetCategories(existingCategories: string[], budgetedCategories: string[]) {
  const budgeted = new Set(budgetedCategories);
  return [...new Set([...REFERENCE_CATEGORIES, ...existingCategories])].filter((category) => !budgeted.has(category) && !["Income", "Transfers", "Uncategorized"].includes(category));
}
