import { z } from "zod";
import type { AICategorizationInput, AIProvider } from "./ai-provider";
import type { CategoryResult } from "@/types/banking";
import { CATEGORY_NAMES, CATEGORY_TAXONOMY, isAllowedCategory, type CategoryName } from "@/lib/categories/taxonomy";
import { normalizeMerchant } from "@/lib/rules/categorize";

const OPENAI_URL = "https://api.openai.com/v1/responses";
export const DEFAULT_OPENAI_CATEGORIZATION_MODEL = "gpt-5.6-luna";
const SUPPORTED_MODELS = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5-mini"] as const;
type CategorizationModel = typeof SUPPORTED_MODELS[number];
const TIMEOUT_MS = 12_000;
const ALL_SUBCATEGORIES = [...new Set(Object.values(CATEGORY_TAXONOMY).flat())];
const AI_CATEGORY_NAMES = CATEGORY_NAMES.filter((category) => category !== "Uncategorized");

/**
 * Rattache la sous-catégorie renvoyée à celle de la taxonomie.
 *
 * Le schéma JSON contraint la catégorie par une énumération mais laisse la sous-catégorie en
 * texte libre : un schéma strict ne sait pas exprimer qu'elle dépend de la catégorie. Le
 * modèle produit donc parfois « Convenience store » au lieu de « Convenience Store », ou
 * invente « Travel booking service ».
 *
 * La casse est ignorée, et une sous-catégorie non reconnue retombe sur « Other » de la
 * catégorie plutôt que d'invalider toute la réponse : la catégorie est le signal utile, et la
 * rejeter pour une nuance de libellé revenait à payer un appel pour rien — un cinquième des
 * appels sur les données réelles.
 */
function resolveSubcategory(category: string, subcategory: string): string | null {
  if (!(category in CATEGORY_TAXONOMY)) return null;
  const allowed = CATEGORY_TAXONOMY[category as CategoryName] as readonly string[];
  const matched = allowed.find((value) => value.toLowerCase() === subcategory.trim().toLowerCase());
  return matched ?? (allowed.includes("Other") ? "Other" : allowed[0] ?? null);
}

const resultSchema = z.object({
  category: z.enum(AI_CATEGORY_NAMES as [string, ...string[]]),
  subcategory: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().max(160)
}).strict().transform((value, ctx) => {
  const subcategory = resolveSubcategory(value.category, value.subcategory);
  if (!subcategory) { ctx.addIssue({ code: "custom", message: "Sous-catégorie incompatible" }); return z.NEVER; }
  return { ...value, subcategory };
});

const responseSchema = z.object({
  output_text: z.string().max(2_000).optional(),
  output: z.array(z.object({ content: z.array(z.object({ type: z.string(), text: z.string().max(2_000).optional() }).passthrough()).optional() }).passthrough()).optional(),
  status: z.string().optional(),
  incomplete_details: z.object({ reason: z.string().optional() }).nullable().optional()
}).passthrough();

export class AIProviderError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export class OpenAIProvider implements AIProvider {
  readonly model: CategorizationModel;
  constructor(private readonly apiKey: string, private readonly http: typeof fetch = fetch, options: { model?: string } = {}) {
    if (!apiKey.trim()) throw new Error("OPENAI_API_KEY manquante.");
    const requestedModel = options.model ?? DEFAULT_OPENAI_CATEGORIZATION_MODEL;
    if (!SUPPORTED_MODELS.includes(requestedModel as CategorizationModel)) throw new Error("Modèle de catégorisation OpenAI non autorisé.");
    this.model = requestedModel as CategorizationModel;
  }

  async categorizeTransaction(transaction: AICategorizationInput): Promise<CategoryResult> {
    const payload = buildSafeCategorizationPayload(transaction);
    const body = {
      model: this.model,
      store: false,
      instructions: "Classifie le commerçant dans la taxonomie fournie. Utilise Coffee/Coffee Shop pour les cafés, Restaurants/Restaurant pour les restaurants avec service, Food & Drink/Fast Food ou Delivery pour la restauration rapide et la livraison, Travel/Flights pour les compagnies aériennes. Réponds uniquement avec le JSON structuré. N'invente aucune donnée personnelle.",
      input: JSON.stringify(payload),
      max_output_tokens: 800,
      reasoning: { effort: reasoningEffort(this.model) },
      text: { format: { type: "json_schema", name: "transaction_category", strict: true, schema: outputJsonSchema() } }
    };
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.http(OPENAI_URL, {
          method: "POST",
          headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: AbortSignal.timeout(TIMEOUT_MS)
        });
        if (!response.ok) {
          if ((response.status === 429 || response.status >= 500) && attempt === 0) continue;
          throw new AIProviderError(`http_${response.status}`, `OpenAI indisponible (${response.status}).`);
        }
        const parsedResponse = responseSchema.parse(await response.json());
        const outputText = parsedResponse.output_text ?? parsedResponse.output?.flatMap((item) => item.content ?? []).find((content) => content.type === "output_text")?.text;
        if (!outputText) {
          const reason = parsedResponse.incomplete_details?.reason ?? parsedResponse.status ?? "empty_output";
          throw new AIProviderError(`incomplete_${reason}`, "OpenAI n’a retourné aucune classification complète.");
        }
        const result = resultSchema.parse(JSON.parse(outputText));
        return { ...result, source: "ai" };
      } catch (error) {
        lastError = error;
        if (attempt === 0 && error instanceof TypeError) continue;
        break;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Catégorisation OpenAI impossible.");
  }
}

export function createOpenAIProviderIfConfigured(http?: typeof fetch): OpenAIProvider | undefined {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key ? new OpenAIProvider(key, http, { model: process.env.OPENAI_CATEGORIZATION_MODEL?.trim() || undefined }) : undefined;
}

function reasoningEffort(model: CategorizationModel) { return model.startsWith("gpt-5.6-") ? "none" : "minimal"; }

export function buildSafeCategorizationPayload(input: AICategorizationInput) {
  return {
    merchant: normalizeMerchant(input.merchant).slice(0, 80),
    description: sanitizeDescription(input.description),
    amount: Math.abs(input.amount),
    currency: input.currency.toUpperCase().slice(0, 3),
    existing_categories: input.existingCategories.filter((category) => CATEGORY_NAMES.includes(category as never))
  };
}

export function sanitizeDescription(value: string): string {
  return value.normalize("NFKC")
    .replace(/https?:\/\/\S+|\b\S+@\S+\.\S+\b/gi, "[REDACTED]")
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/gi, "[REDACTED]")
    .replace(/\b(?:\d[ -]?){6,19}\b/g, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function outputJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["category", "subcategory", "confidence", "reason"],
    properties: {
      category: { type: "string", enum: AI_CATEGORY_NAMES },
      subcategory: { type: "string", enum: ALL_SUBCATEGORIES },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reason: { type: "string", maxLength: 160 }
    }
  };
}
