/**
 * Ce que chaque compte peut consommer par jour.
 *
 * Les limites sont hautes à dessein : elles ne visent pas à rationner un usage normal mais à
 * borner ce qu'un compte peut coûter — une boucle, un script, ou simplement quelqu'un qui
 * s'amuse. Un utilisateur qui les atteint dans une journée ordinaire signale que la limite est
 * mal calibrée, pas qu'il abuse.
 *
 * La fenêtre est le jour civil UTC. Une fenêtre glissante serait plus juste mais demanderait de
 * conserver chaque appel ; un jour civil tient en une ligne et se dit en une phrase — « il vous
 * reste 28 messages aujourd'hui ».
 */
export const QUOTAS = {
  /**
   * L'assistant appelle le modèle plusieurs fois par question, une par outil sollicité. C'est
   * de loin le poste le plus cher, et le seul qu'on peut déclencher sans limite en tapant.
   */
  assistant: 40,
  /**
   * La catégorisation tourne déjà seule à chaque synchronisation. Un déclenchement manuel n'a
   * de sens que pour rattraper une correction de règle, ce qui n'arrive pas dix fois par jour.
   */
  categorization: 5,
  /**
   * Une synchronisation appelle la banque, dont le quota est compté par l'agrégateur : le
   * dépassement se paierait en refus pour tout le monde, pas seulement pour l'appelant.
   */
  bank_sync: 20
} as const;

export type QuotaResource = keyof typeof QUOTAS;

export interface QuotaVerdict {
  allowed: boolean;
  used: number;
  quota: number;
  remaining: number;
}

/** Message destiné à l'utilisateur. Dit quoi faire, et quand — jamais seulement « refusé ». */
export function quotaMessage(resource: QuotaResource, verdict: QuotaVerdict): string {
  const labels: Record<QuotaResource, string> = {
    assistant: "questions à l’assistant",
    categorization: "relances de la catégorisation",
    bank_sync: "synchronisations bancaires"
  };
  return `Vous avez atteint la limite de ${verdict.quota} ${labels[resource]} par jour. Elle repart à zéro à minuit.`;
}

/** Traduit un décompte brut en verdict, `remaining` ne descendant jamais sous zéro. */
export function toVerdict(row: { allowed: boolean; used: number; quota: number } | undefined): QuotaVerdict {
  // Sans ligne, on laisse passer : un compteur illisible ne doit pas rendre l'application
  // inutilisable. Le risque est une dépense, pas une fuite — et il se voit dans les journaux.
  if (!row) return { allowed: true, used: 0, quota: 0, remaining: 0 };
  return { allowed: row.allowed, used: row.used, quota: row.quota, remaining: Math.max(row.quota - row.used, 0) };
}
