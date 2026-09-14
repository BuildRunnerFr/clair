import type { CategorizationReferenceCase } from "./reference-dataset";

/**
 * Regression cases inspired by observed provider label shapes, but fully synthetic.
 * Only add invented merchants/descriptions here. Never paste exports, identifiers,
 * account details, emails, IBANs, tokens, or raw TrueLayer payloads.
 */
export const ANONYMIZED_SANDBOX_REFERENCE_CASES: readonly CategorizationReferenceCase[] = [
  { id: "sandbox-generic-coffee-terminal", merchant: "GENERIC COFFEE SHOP 0042", description: "GENERIC COFFEE SHOP TERMINAL 0042", amount: -4.5, currency: "GBP", expectedCategory: "Coffee", expectedSubcategory: "Coffee Shop" },
  { id: "sandbox-generic-transit", merchant: "GENERIC CITY TRANSIT", description: "GENERIC CITY TRANSIT CONTACTLESS", amount: -3.2, currency: "GBP", expectedCategory: "Transport", expectedSubcategory: "Public Transport" },
  { id: "sandbox-generic-cloud", merchant: "GENERIC CLOUD TOOLS", description: "GENERIC CLOUD TOOLS MONTHLY", amount: -9.99, currency: "GBP", expectedCategory: "Subscriptions", expectedSubcategory: "Cloud" }
] as const;
