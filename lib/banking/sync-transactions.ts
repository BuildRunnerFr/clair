import type { BankProvider } from "./bank-provider";
import type { TransactionRepository } from "@/lib/db/transaction-repository";
import { mapExternalTransaction } from "./mappers";
import type { StoredTransaction } from "@/types/database";
import type { AIProvider } from "@/lib/ai/ai-provider";
import { categorizeTransactions } from "@/lib/ai/categorization-pipeline";
import type { ConversionRequest, ConversionResult } from "@/lib/fx/fx-converter";

export interface SyncSummary {
  added: number;
  updated: number;
  ignored: number;
  errors: Array<{ providerTransactionId?: string; message: string }>;
  accountCount: number;
  received: number;
  databaseBatches: number;
  databaseUpsertCalls: number;
  fetchDurationMs: number;
  writeDurationMs: number;
  durationMs: number;
  categorizedByRule: number;
  categorizedByAI: number;
  uncategorized: number;
  aiCalls: number;
  aiErrors: number;
  aiErrorCodes: Record<string, number>;
  categorizationDurationMs: number;
  balancesUpdated: number;
  balanceError?: string;
  converted: number;
  unconverted: number;
  conversionError?: string;
}

/**
 * Convertit un lot dans la devise principale. Optionnel comme le fournisseur d'IA : sans lui
 * la synchronisation fonctionne, mais les transactions restent hors des agrégats, qui ne
 * comptent que les montants convertis.
 */
export type SyncConverter = (requests: ConversionRequest[]) => Promise<ConversionResult[]>;

export async function syncTransactions(
  userId: string,
  connectionId: string,
  provider: BankProvider,
  repository: TransactionRepository,
  range = { from: new Date(Date.now() - 90 * 86_400_000), to: new Date() },
  aiProvider?: AIProvider,
  convert?: SyncConverter
): Promise<SyncSummary> {
  const startedAt = performance.now();
  const summary: SyncSummary = { added: 0, updated: 0, ignored: 0, errors: [], accountCount: 0, received: 0, databaseBatches: 0, databaseUpsertCalls: 0, fetchDurationMs: 0, writeDurationMs: 0, durationMs: 0, categorizedByRule: 0, categorizedByAI: 0, uncategorized: 0, aiCalls: 0, aiErrors: 0, aiErrorCodes: {}, categorizationDurationMs: 0, balancesUpdated: 0, converted: 0, unconverted: 0 };
  const fetchStartedAt = performance.now();
  const [transactions, bankAccounts, rules] = await Promise.all([
    provider.getTransactions(connectionId, range.from, range.to),
    provider.getAccounts(connectionId),
    repository.findMerchantRules(userId)
  ]);
  summary.fetchDurationMs = Math.round(performance.now() - fetchStartedAt);
  summary.received = transactions.length;
  summary.accountCount = bankAccounts.length;
  const accounts = await repository.upsertAccounts(userId, provider.name, bankAccounts);

  // Balances are a bonus signal, never a reason to lose an otherwise successful sync: any
  // provider or database failure here is recorded in the summary and swallowed.
  if (provider.getBalances && bankAccounts.length) {
    try {
      const balances = await provider.getBalances(bankAccounts.map((account) => account.providerAccountId));
      summary.balancesUpdated = await repository.updateAccountBalances(userId, provider.name, balances);
    } catch (error) {
      summary.balanceError = error instanceof Error ? error.message : "Échec de récupération des soldes";
    }
  }

  const accountIds = new Map(accounts.map((account) => [account.providerAccountId, account.id]));
  const mappedTransactions: StoredTransaction[] = [];
  for (const transaction of transactions) {
    try {
      const mapped = mapExternalTransaction(transaction);
      const accountId = accountIds.get(mapped.providerAccountId);
      if (!accountId) throw new Error("Compte bancaire inconnu pour cette transaction");
      mappedTransactions.push({
        userId,
        accountId,
        providerTransactionId: mapped.providerTransactionId,
        merchantName: mapped.merchantName,
        description: mapped.description,
        amount: mapped.amount,
        currency: mapped.currency,
        transactionDate: mapped.transactionDate,
        pending: mapped.pending,
        category: "Uncategorized",
        subcategory: "Other",
        categorySource: "uncategorized",
        categoryConfidence: null,
        categorizedAt: null,
        rawData: mapped.safeMetadata
      });
    } catch (error) {
      summary.errors.push({ providerTransactionId: transaction.providerTransactionId, message: error instanceof Error ? error.message : "Erreur inconnue" });
    }
  }
  const existing = await repository.findMatchingTransactions(mappedTransactions);
  const existingByKey = new Map(existing.map((transaction) => [transactionKey(transaction), transaction]));
  const needingCategory: StoredTransaction[] = [];
  for (const transaction of mappedTransactions) {
    const previous = existingByKey.get(transactionKey(transaction));
    if (previous && previous.category !== "Uncategorized") {
      Object.assign(transaction, { category: previous.category, subcategory: previous.subcategory, categorySource: previous.categorySource, categoryConfidence: previous.categoryConfidence, categorizedAt: previous.categorizedAt });
    } else needingCategory.push(transaction);
  }
  const categorized = await categorizeTransactions(needingCategory, rules, aiProvider);
  const categorizedByKey = new Map(categorized.transactions.map((transaction) => [transactionKey(transaction), transaction]));
  mappedTransactions.forEach((transaction, index) => { mappedTransactions[index] = categorizedByKey.get(transactionKey(transaction)) ?? transaction; });
  Object.assign(summary, { categorizedByRule: categorized.summary.byRule, categorizedByAI: categorized.summary.byAI, uncategorized: categorized.summary.uncategorized, aiCalls: categorized.summary.aiCalls, aiErrors: categorized.summary.aiErrors, aiErrorCodes: categorized.summary.aiErrorCodes, categorizationDurationMs: categorized.summary.durationMs });
  try {
    await repository.saveAiMerchantRules(categorized.summary.rememberedRules);
  } catch {
    summary.aiErrors++;
  }
  // Valorisation dans la devise principale, juste avant l'écriture. Les agrégats ne comptent
  // que les montants convertis : sans cette étape, une transaction fraîchement importée
  // existe en base mais reste invisible partout dans l'application.
  if (convert && mappedTransactions.length) {
    try {
      const conversions = await convert(mappedTransactions.map((transaction) => ({ amount: transaction.amount, currency: transaction.currency, date: transaction.transactionDate })));
      conversions.forEach((conversion, index) => {
        const transaction = mappedTransactions[index];
        if (!transaction) return;
        if (conversion.amountBase === null) { summary.unconverted++; return; }
        Object.assign(transaction, { amountBase: conversion.amountBase, baseCurrency: conversion.baseCurrency, fxRate: conversion.fxRate, fxRateDate: conversion.fxRateDate });
        summary.converted++;
      });
      const failure = conversions.find((conversion) => conversion.error);
      if (failure?.error) summary.conversionError = failure.error;
    } catch (error) {
      // Comme pour les soldes et l'IA : un taux indisponible ne doit pas faire perdre
      // l'import. Les transactions sont écrites sans conversion et une prochaine
      // synchronisation les rattrapera.
      summary.conversionError = error instanceof Error ? error.message : "Échec de conversion";
      summary.unconverted = mappedTransactions.length;
    }
  }

  const writeStartedAt = performance.now();
  const result = await repository.upsertTransactions(mappedTransactions);
  summary.writeDurationMs = Math.round(performance.now() - writeStartedAt);
  summary.added = result.inserted;
  summary.updated = result.updated;
  summary.ignored = result.duplicate;
  summary.databaseBatches = result.batches;
  summary.databaseUpsertCalls = result.upsertCalls;
  summary.durationMs = Math.round(performance.now() - startedAt);
  return summary;
}

function transactionKey(transaction: Pick<StoredTransaction, "accountId" | "providerTransactionId">) { return `${transaction.accountId}\u0000${transaction.providerTransactionId}`; }
