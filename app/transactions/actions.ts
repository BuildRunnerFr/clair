"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/user";
import { SupabaseTransactionRepository } from "@/lib/db/supabase-transaction-repository";
import { normalizeMerchant } from "@/lib/rules/categorize";
import { isAllowedCategory } from "@/lib/categories/taxonomy";

/** Corrige une opération ; une règle de commerçant exige un choix explicite. */
const schema = z.object({
  transactionId: z.string().uuid(),
  scope: z.enum(["transaction", "merchant"]).default("transaction"),
  merchant: z.string().trim().min(1).max(160),
  // « Catégorie|Sous-catégorie » : les deux voyagent ensemble parce que la validation les
  // vérifie ensemble — une sous-catégorie n'est valide que dans sa catégorie.
  classification: z.string().trim().min(3).max(160),
  returnTo: z.string().trim().max(300).optional()
});

export async function reclassifyFromTransactions(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  // Le retour est reconstruit à partir de la requête, jamais repris tel quel : une chaîne
  // fournie par le formulaire et passée à redirect ouvrirait une redirection vers n'importe
  // quel site depuis une page authentifiée.
  const back = safeReturn(parsed.success ? parsed.data.returnTo : undefined);
  if (!parsed.success) redirect(`${back}${back.includes("?") ? "&" : "?"}error=invalid_category`);

  const [category, subcategory] = parsed.data.classification.split("|");
  if (!category || !subcategory || !isAllowedCategory(category, subcategory)) {
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=invalid_category`);
  }

  const { user, supabase } = await requireUser();
  const repository = new SupabaseTransactionRepository(supabase);
  const normalized = normalizeMerchant(parsed.data.merchant);
  if (parsed.data.scope === "merchant" && !normalized) redirect(`${back}${back.includes("?") ? "&" : "?"}error=invalid_category`);
  let updated = 0;
  try {
    if (parsed.data.scope === "merchant") {
      await repository.upsertManualMerchantRule({ userId: user.id, merchantPattern: normalized, normalizedMerchant: normalized, category, subcategory, source: "manual", confidence: 1 });
      updated = await repository.updateMerchantClassification(user.id, normalized, category, subcategory);
    } else {
      updated = await repository.updateTransactionClassification(user.id, parsed.data.transactionId, category, subcategory);
    }
  } catch {
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=save_failed`);
  }
  if (!updated) redirect(`${back}${back.includes("?") ? "&" : "?"}error=not_found`);
  for (const path of ["/transactions", "/dashboard", "/budgets"]) revalidatePath(path);
  redirect(`${back}${back.includes("?") ? "&" : "?"}reclassified=${updated}`);
}

/**
 * N'accepte qu'un chemin de cette application, avec sa requête.
 *
 * Une adresse absolue, un double slash — que les navigateurs lisent comme un autre domaine —
 * ou tout ce qui n'est pas la page des transactions retombe sur celle-ci sans filtre.
 */
function safeReturn(value: string | undefined): string {
  if (!value || !(value === "/transactions" || value.startsWith("/transactions?")) || /[\\\r\n]/.test(value)) return "/transactions";
  return value;
}
