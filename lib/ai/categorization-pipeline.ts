import type { AIProvider } from "./ai-provider";
import { z } from "zod";
import type { StoredTransaction, MerchantRule } from "@/types/database";
import { CATEGORY_NAMES } from "@/lib/categories/taxonomy";
import { categorizeMerchant, normalizeMerchant } from "@/lib/rules/categorize";
import { redactForAi } from "@/lib/ai/redact";

export const AI_MEMORY_THRESHOLD = 0.9;
export const AI_APPLY_THRESHOLD = 0.7;
/**
 * Combien de marchands inconnus une passe ordinaire soumet à l'IA.
 *
 * Vingt-cinq suffisent au delta d'une journée. Ils ne suffisent pas à une reprise d'historique,
 * qui en découvre des centaines d'un coup : le rattrapage passe donc une limite plus haute.
 */
export const AI_MERCHANT_LIMIT = 25;
const AI_CONCURRENCY = 3;

export interface CategorizationSummary {
  byRule: number;
  byAI: number;
  uncategorized: number;
  aiCalls: number;
  aiErrors: number;
  aiErrorCodes: Record<string, number>;
  rememberedRules: MerchantRule[];
  uniqueMerchants: number;
  merchantsCoveredByRule: number;
  highConfidence: number;
  intermediateConfidence: number;
  lowConfidence: number;
  merchantResults: MerchantCategorizationResult[];
  /** Marchands réellement soumis à l'IA : le reste attend une passe suivante. */
  merchantsAttempted: number;
  durationMs: number;
}

export interface MerchantCategorizationResult {
  normalizedMerchant: string;
  sampleDescription: string;
  transactionsCount: number;
  previousCategory: string;
  newCategory: string;
  subcategory: string;
  source: StoredTransaction["categorySource"];
  confidence: number | null;
  ruleCreated: boolean;
}

export async function categorizeTransactions(
  transactions: StoredTransaction[],
  rules: MerchantRule[],
  aiProvider?: AIProvider,
  merchantLimit = AI_MERCHANT_LIMIT
): Promise<{ transactions: StoredTransaction[]; summary: CategorizationSummary }> {
  const startedAt = performance.now();
  const summary: CategorizationSummary = { byRule: 0, byAI: 0, uncategorized: 0, aiCalls: 0, aiErrors: 0, aiErrorCodes: {}, rememberedRules: [], uniqueMerchants: 0, merchantsCoveredByRule: 0, highConfidence: 0, intermediateConfidence: 0, lowConfidence: 0, merchantResults: [], merchantsAttempted: 0, durationMs: 0 };
  const output = transactions.map((transaction) => ({ ...transaction }));
  const unknown = new Map<string, number[]>();
  const groups = new Map<string, number[]>();
  output.forEach((transaction, index) => {
    const normalized = normalizeMerchant(transaction.merchantName || transaction.description) || "UNKNOWN";
    groups.set(normalized, [...(groups.get(normalized) ?? []), index]);
  });
  summary.uniqueMerchants = groups.size;

  groups.forEach((indexes, normalized) => {
    const representative = output[indexes[0]!]!;
    const result = categorizeMerchant(representative.merchantName || representative.description, rules);
    if (result.source !== "uncategorized") {
      indexes.forEach((index) => applyCategory(output[index]!, result.category, result.subcategory, result.source, result.confidence));
      summary.byRule += indexes.length;
      summary.merchantsCoveredByRule++;
      summary.merchantResults.push(merchantResult(normalized, representative, indexes.length, result.category, result.subcategory, result.source, result.confidence, false));
      return;
    }
    unknown.set(normalized, indexes);
  });

  if (aiProvider) {
    // Les plus gros marchands d'abord, et non les plus récents. Le budget d'une passe se compte
    // en marchands, mais son effet se mesure en transactions : classer « VOI FR » en range
    // vingt et une d'un coup, quand vingt-cinq marchands vus une seule fois en rangent
    // vingt-cinq. À budget égal, la file se vide plusieurs fois plus vite.
    const unknownGroups = [...unknown.entries()]
      .sort(([, left], [, right]) => right.length - left.length)
      .slice(0, merchantLimit);
    summary.merchantsAttempted = unknownGroups.length;
    await mapWithConcurrency(unknownGroups, AI_CONCURRENCY, async ([normalized, indexes]) => {
      const representative = output[indexes[0]!]!;
      summary.aiCalls++;
      try {
        const result = await aiProvider.categorizeTransaction({
          // Masqués avant de sortir de l'application : un libellé de virement porte le nom d'un
          // tiers, une fin d'IBAN et des références. Ces gens ne sont pas l'utilisateur et n'ont
          // rien accepté, et leur nom n'aide en rien à classer — un virement est un virement.
          merchant: redactForAi(normalized),
          description: redactForAi(representative.description),
          amount: representative.amount,
          currency: representative.currency,
          existingCategories: CATEGORY_NAMES.filter((category) => category !== "Uncategorized")
        });
        if (result.confidence === null || result.confidence < AI_APPLY_THRESHOLD) {
          summary.lowConfidence++;
          summary.merchantResults.push(merchantResult(normalized, representative, indexes.length, "Uncategorized", "Other", "uncategorized", result.confidence, false));
          return;
        }
        indexes.forEach((index) => applyCategory(output[index]!, result.category, result.subcategory, "ai", result.confidence));
        summary.byAI += indexes.length;
        unknown.delete(normalized);
        const ruleCreated = result.confidence >= AI_MEMORY_THRESHOLD;
        if (ruleCreated) {
          summary.highConfidence++;
          summary.rememberedRules.push({ userId: representative.userId, merchantPattern: normalized, normalizedMerchant: normalized, category: result.category, subcategory: result.subcategory, source: "ai", confidence: result.confidence });
        } else summary.intermediateConfidence++;
        summary.merchantResults.push(merchantResult(normalized, representative, indexes.length, result.category, result.subcategory, "ai", result.confidence, ruleCreated));
      } catch (error) {
        summary.aiErrors++;
        const code = safeErrorCode(error);
        summary.aiErrorCodes[code] = (summary.aiErrorCodes[code] ?? 0) + 1;
        summary.merchantResults.push(merchantResult(normalized, representative, indexes.length, "Uncategorized", "Other", "uncategorized", null, false));
      }
    });
  }

  for (const [normalized, indexes] of unknown) {
    if (summary.merchantResults.some((result) => result.normalizedMerchant === normalized)) continue;
    const representative = output[indexes[0]!]!;
    summary.merchantResults.push(merchantResult(normalized, representative, indexes.length, "Uncategorized", "Other", "uncategorized", null, false));
  }

  summary.uncategorized = output.filter((transaction) => transaction.category === "Uncategorized").length;
  summary.durationMs = Math.round(performance.now() - startedAt);
  return { transactions: output, summary };
}

function merchantResult(normalizedMerchant: string, transaction: StoredTransaction, transactionsCount: number, newCategory: string, subcategory: string, source: StoredTransaction["categorySource"], confidence: number | null, ruleCreated: boolean): MerchantCategorizationResult {
  return { normalizedMerchant, sampleDescription: safeSample(transaction.description), transactionsCount, previousCategory: "Uncategorized", newCategory, subcategory, source, confidence, ruleCreated };
}

function safeSample(value: string) {
  return value.normalize("NFKC")
    .replace(/https?:\/\/\S+|\b\S+@\S+\.\S+\b/gi, "[REDACTED]")
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/gi, "[REDACTED]")
    .replace(/\b(?:\d[ -]?){6,19}\b/g, "[REDACTED]")
    .replace(/\s+/g, " ").trim().slice(0, 100);
}

function safeErrorCode(error: unknown) {
  if (error instanceof Error && "code" in error && typeof error.code === "string") return error.code;
  if (error instanceof DOMException && error.name === "TimeoutError") return "timeout";
  if (error instanceof z.ZodError || error instanceof SyntaxError) return "invalid_response";
  return "network_or_provider_error";
}

function applyCategory(transaction: StoredTransaction, category: string, subcategory: string, source: NonNullable<StoredTransaction["categorySource"]>, confidence: number | null) {
  transaction.category = category;
  transaction.subcategory = subcategory;
  transaction.categorySource = source;
  transaction.categoryConfidence = confidence;
  transaction.categorizedAt = category === "Uncategorized" ? null : new Date().toISOString();
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, operation: (item: T) => Promise<void>) {
  let index = 0;
  async function worker() {
    while (index < items.length) await operation(items[index++]!);
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}
