import type { CategoryResult } from "@/types/banking";
import type { MerchantRule } from "@/types/database";
import { isAllowedCategory } from "@/lib/categories/taxonomy";

const DEFAULT_RULES: Array<Omit<MerchantRule, "userId">> = [
  { merchantPattern: "STARBUCKS", category: "Food & Drink", subcategory: "Coffee" },
  { merchantPattern: "GRAB", category: "Transport", subcategory: "Ride Hailing" },
  { merchantPattern: "UBER EATS", category: "Food & Drink", subcategory: "Delivery" },
  { merchantPattern: "UBER", category: "Transport", subcategory: "Ride Hailing" },
  { merchantPattern: "NETFLIX", category: "Subscriptions", subcategory: "Streaming" },
  { merchantPattern: "SPOTIFY", category: "Subscriptions", subcategory: "Music" },
  { merchantPattern: "CARREFOUR", category: "Groceries", subcategory: "Supermarket" },
  { merchantPattern: "JAYA GROCER", category: "Groceries", subcategory: "Supermarket" },
  { merchantPattern: "RESTAURANT", category: "Food & Drink", subcategory: "Restaurant" },
  { merchantPattern: "SHOPEE", category: "Shopping", subcategory: "Marketplace" },
  { merchantPattern: "UNIQLO", category: "Shopping", subcategory: "Clothing" },
  { merchantPattern: "LOYER", category: "Housing", subcategory: "Rent" },
  { merchantPattern: "AIRASIA", category: "Travel", subcategory: "Flights" },
  { merchantPattern: "SALARY", category: "Income", subcategory: "Salary" }
];

export function normalizeMerchant(value: string): string {
  let normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  normalized = normalized.replace(/HTTPS?:\/\/\S+|\b(?:HELP\.)?[A-Z0-9-]+\.(?:COM|CO\.UK|NET|ORG)\b/g, " ");
  normalized = normalized.replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const aliases: Array<[RegExp, string]> = [
    [/^STARBUCKS\b/, "STARBUCKS"],
    [/^UBER\s*EATS\b/, "UBER EATS"],
    [/^UBER\b/, "UBER"],
    [/^(?:AMZN|AMAZON)\b/, "AMAZON"],
    [/^OVO\s+ENERGY\b/, "OVO ENERGY"]
  ];
  const alias = aliases.find(([pattern]) => pattern.test(normalized));
  if (alias) return alias[1];
  return normalized.split(" ")
    .filter((token) => !/^(?:LTD|LIMITED|PLC|POS|PAYMENT|PURCHASE|CARD|DEBIT|CREDIT|ONLINE|TRIP|UK)$/.test(token))
    .filter((token) => !/^\d{3,}$/.test(token) && !/^(?=.*\d)[A-Z0-9]{5,}$/.test(token))
    .join(" ")
    .trim();
}

/**
 * Un libellé commençant par « TO » ou « FROM » désigne un virement entre particuliers, et le
 * reste du libellé est le nom d'une personne.
 *
 * Motif ancré, jamais une sous-chaîne : « AUTO », « TOTAL » ou « TO GO » contiennent « TO »
 * sans être des virements, et les règles par défaut, elles, comparent par inclusion.
 *
 * Résoudre ces libellés localement n'est pas qu'une économie d'appels : sans cette règle, le
 * nom complet de tiers partirait chez OpenAI. Le pipeline masque e-mails, IBAN et suites de
 * chiffres, mais aucun filtre ne reconnaît un nom propre.
 */
const PERSON_TRANSFER = /^(?:TO|FROM)\s+\S/;

export function categorizeMerchant(merchant: string, savedRules: MerchantRule[] = []): CategoryResult {
  const normalized = normalizeMerchant(merchant);
  const prioritized = [...savedRules].sort((left, right) => rulePriority(left) - rulePriority(right));
  const saved = prioritized.find((rule) => isAllowedCategory(rule.category, rule.subcategory) && ruleMatches(normalized, rule));
  if (saved && isAllowedCategory(saved.category, saved.subcategory)) return { category: saved.category, subcategory: saved.subcategory, source: saved.source === "ai" ? "ai" : saved.source === "default" ? "default" : "manual", confidence: saved.confidence ?? 1 };

  // Après les règles de l'utilisateur, qui gardent la priorité, mais avant les règles par
  // défaut : une correspondance par inclusion pourrait sinon coiffer ce motif.
  if (PERSON_TRANSFER.test(normalized)) return { category: "Transfers", subcategory: "Bank Transfer", source: "default", confidence: 1 };

  const fallback = DEFAULT_RULES.find((rule) => (` ${normalized} `).includes(` ${normalizeMerchant(rule.merchantPattern)} `));
  if (fallback) return { category: fallback.category, subcategory: fallback.subcategory, source: "default", confidence: 1 };

  return { category: "Uncategorized", subcategory: "Other", source: "uncategorized", confidence: null };
}

function rulePriority(rule: MerchantRule) { return rule.source === "manual" || !rule.source ? 0 : rule.source === "ai" ? 1 : 2; }
function ruleMatches(normalized: string, rule: MerchantRule) {
  const pattern = rule.normalizedMerchant || normalizeMerchant(rule.merchantPattern);
  return Boolean(pattern) && normalized === pattern;
}
