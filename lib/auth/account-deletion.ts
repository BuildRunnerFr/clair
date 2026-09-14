/**
 * Vérifie que l'utilisateur a bien retapé son adresse pour confirmer la suppression.
 *
 * Une case à cocher ou un second bouton ne protègent de rien : on les actionne sans lire. Faire
 * recopier l'adresse impose de comprendre ce qu'on efface, et c'est le seul geste qui ne se
 * produit pas par distraction.
 *
 * La comparaison ignore la casse et les espaces de bord, mais rien d'autre : une adresse
 * approchante n'est pas une confirmation. Une adresse absente ne peut jamais être confirmée,
 * plutôt que de laisser deux valeurs vides se valider mutuellement.
 */
export function confirmsDeletion(typed: unknown, email: string | undefined | null): boolean {
  const expected = email?.trim().toLowerCase() ?? "";
  if (!expected) return false;
  const candidate = typeof typed === "string" ? typed.trim().toLowerCase() : "";
  return candidate === expected;
}
