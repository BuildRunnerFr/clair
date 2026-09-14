import type { BankTransaction, InternalTransactionInput } from "@/types/banking";
import { normalizeMerchant } from "@/lib/rules/categorize";

export function mapExternalTransaction(transaction: BankTransaction): InternalTransactionInput {
  return {
    providerTransactionId: transaction.providerTransactionId,
    providerAccountId: transaction.providerAccountId,
    merchantName: normalizeMerchant(transaction.merchantName || transaction.description || "Unknown"),
    description: transaction.description.trim(),
    amount: transaction.amount,
    currency: transaction.currency.toUpperCase(),
    transactionDate: new Date(transaction.transactionDate).toISOString(),
    pending: transaction.pending,
    safeMetadata: sanitizeProviderMetadata(transaction.rawData)
  };
}

function sanitizeProviderMetadata(raw?: Record<string, unknown>) {
  if (!raw) return undefined;
  // Liste blanche : tout ce qui n'y figure pas est écarté, y compris un payload bancaire
  // complet. providerClassification y entre parce que c'est une étiquette de catégorie.
  const allowed = new Set(["source", "safeReference", "providerClassification"]);
  const entries = Object.entries(raw).filter((entry): entry is [string, string | number | boolean] => allowed.has(entry[0]) && ["string", "number", "boolean"].includes(typeof entry[1]));
  return entries.length ? Object.fromEntries(entries) : undefined;
}
