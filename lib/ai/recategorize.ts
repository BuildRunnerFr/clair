import type { AIProvider } from "./ai-provider";
import { categorizeTransactions } from "./categorization-pipeline";
import type { TransactionRepository } from "@/lib/db/transaction-repository";

export async function recategorizeHistoricalTransactions(userId: string, repository: TransactionRepository, aiProvider?: AIProvider, limit = 1000, provider?: string, merchantLimit?: number) {
  const startedAt = performance.now();
  const [transactions, rules] = await Promise.all([
    provider ? repository.getUncategorizedTransactionsForProvider(userId, provider, limit) : repository.getUncategorizedTransactions(userId, limit),
    repository.findMerchantRules(userId)
  ]);
  const categorized = await categorizeTransactions(transactions, rules, aiProvider, merchantLimit);
  let rulesCreated = 0;
  try {
    await repository.saveAiMerchantRules(categorized.summary.rememberedRules);
    rulesCreated = categorized.summary.rememberedRules.length;
  } catch { categorized.summary.aiErrors++; }
  const changed = categorized.transactions.filter((transaction) => transaction.category !== "Uncategorized");
  const writes = await repository.upsertTransactions(changed);
  // Consigner la tentative, y compris quand elle n'a rien donné. C'est ce qui fait avancer la
  // file : sans cette trace, un marchand que l'IA ne sait pas classer garde éternellement sa
  // place en tête et les suivants ne sont jamais atteints.
  await repository.markCategorizationAttempted?.(userId, transactions.map((transaction) => transaction.id).filter((id): id is string => Boolean(id)));
  return {
    processed: transactions.length,
    merchantsAttempted: categorized.summary.merchantsAttempted,
    /** Marchands inconnus restant à soumettre : zéro signifie que la file est vide. */
    merchantsPending: Math.max(0, categorized.summary.uniqueMerchants - categorized.summary.merchantsCoveredByRule - categorized.summary.merchantsAttempted),
    uniqueMerchants: categorized.summary.uniqueMerchants,
    merchantsCoveredByRule: categorized.summary.merchantsCoveredByRule,
    merchantsSentToAI: categorized.summary.aiCalls,
    categorizedByRule: categorized.summary.byRule,
    categorizedByAI: categorized.summary.byAI,
    remaining: categorized.summary.uncategorized,
    aiCalls: categorized.summary.aiCalls,
    aiErrors: categorized.summary.aiErrors,
    aiErrorCodes: categorized.summary.aiErrorCodes,
    rulesCreated,
    highConfidence: categorized.summary.highConfidence,
    intermediateConfidence: categorized.summary.intermediateConfidence,
    lowConfidence: categorized.summary.lowConfidence,
    merchantResults: categorized.summary.merchantResults,
    updated: writes.updated,
    durationMs: Math.round(performance.now() - startedAt)
  };
}
