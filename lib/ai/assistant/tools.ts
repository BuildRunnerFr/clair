import { z } from "zod";
import { redactForAi } from "@/lib/ai/redact";
import { CATEGORY_NAMES } from "@/lib/categories/taxonomy";

/**
 * Les capacités que l'assistant peut invoquer.
 *
 * Presque toutes en lecture seule. La seule écriture — définir un budget — est délibérément
 * étroite : une catégorie de la taxonomie, un montant mensuel positif, dans la devise
 * principale. Elle ne peut ni supprimer, ni toucher une transaction, ni changer un réglage.
 * C'est réversible d'un clic depuis la page Budgets, ce qui n'aurait pas été le cas d'une
 * écriture sur les transactions.
 *
 * Chaque outil s'adosse à une RPC existante, exécutée sous la session de l'utilisateur : le
 * RLS s'applique donc sans que la couche IA ait à s'en préoccuper, et le modèle ne peut
 * structurellement pas atteindre les données d'un autre compte.
 */

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mois attendu au format AAAA-MM");
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ");

/**
 * Une limite trop grande est ramenée au maximum plutôt que refusée : l'intention est
 * dépourvue d'ambiguïté, et un refus coûtait un aller-retour facturé que le modèle
 * s'obstinait à répéter — six rejets consécutifs sur limit=100, puis un « aucune transaction
 * trouvée » présenté à l'utilisateur.
 */
const boundedLimit = (max: number) => z.number().int().min(1).transform((value) => Math.min(value, max)).optional();

/**
 * Une borne facultative que le modèle remplit quand même.
 *
 * Prié d'omettre le mois pour couvrir tout l'historique, il envoie « toutes périodes
 * confondues » — une valeur qui a du sens pour un lecteur et aucune pour un schéma. Le refus
 * était alors présenté à l'utilisateur comme une impossibilité du produit : « je ne peux pas
 * déterminer votre transaction la plus élevée ».
 *
 * Une borne facultative mal formée vaut donc absence de borne. C'est le même arbitrage que pour
 * la limite trop grande, quelques lignes plus bas : sur un paramètre dont l'omission est
 * légitime, corriger vaut mieux que refuser. Là où la borne est obligatoire — get_spending_summary
 * et les autres — le schéma strict reste, et une faute y est bien une faute.
 */
const optionalBound = (forme: RegExp) => z.string().optional()
  .transform((valeur) => (valeur && forme.test(valeur.trim()) ? valeur.trim() : undefined));

/** Une chaîne vide signifie « pas de filtre », pas « filtre sur la chaîne vide ». */
const categoryFilter = z.string().max(60).optional().transform((value) => (value?.trim() ? value.trim() : undefined));

export const TOOL_SCHEMAS = {
  get_spending_summary: z.object({ month: monthSchema }),
  get_spending_by_category: z.object({ from: daySchema, to: daySchema }),
  get_top_merchants: z.object({ month: monthSchema, limit: boundedLimit(20) }),
  get_spending_between: z.object({ from: daySchema, to: daySchema, category: categoryFilter }),
  get_recent_transactions: z.object({ from: daySchema, to: daySchema, limit: boundedLimit(50), category: categoryFilter }),
  get_accounts: z.object({}),
  get_budget_status: z.object({ month: monthSchema }),
  get_month_position: z.object({ month: monthSchema }),
  get_unusual_spending: z.object({ month: monthSchema }),
  get_subscriptions: z.object({}),
  get_month_flows: z.object({ month: monthSchema }),
  /**
   * Aucune borne n'est obligatoire : sans mois ni dates, l'outil couvre tout l'historique.
   *
   * Il exigeait un mois. « Quelle est ma plus grosse dépense depuis la création du compte ? »
   * était donc sans réponse — et l'assistant le disait honnêtement, ce qui ne le rendait pas
   * moins inutile. Une question sur toute la période est la plus naturelle qui soit.
   */
  /**
   * Un outil sans aucune borne, pour la question « depuis toujours ».
   *
   * show_transactions couvre déjà tout l'historique quand on omet ses dates. Prié de les
   * omettre, le modèle inventait pourtant une plage — « toutes périodes confondues » comme
   * valeur de mois, puis une fourchette sur l'année en cours — et répondait à côté sur des
   * données qui, elles, étaient justes. Trois formulations de consigne n'y ont rien changé.
   *
   * Quand un modèle se trompe de paramètre de façon répétée, la correction n'est pas une
   * consigne de plus : c'est de lui retirer le paramètre.
   *
   * Il n'a donc ni date ni catégorie. La catégorie a été retirée après coup, pour la même
   * raison : voyant une énumération de vingt-deux catégories, le modèle appelait l'outil une
   * fois par catégorie avec limit=1, puis recomposait — chaque appel remplaçant la liste
   * affichée, l'utilisateur ne voyait que la dernière, et la réponse annonçait cent cinquante
   * livres là où la vraie plus grosse dépense en valait cinq cent cinquante. Deux consignes
   * explicites n'y ont rien changé ; l'absence du paramètre, si.
   */
  show_largest_transactions: z.object({ limit: boundedLimit(15) }),
  /** Sans paramètre, pour la même raison : voir show_largest_transactions. */
  get_all_time_totals: z.object({}),
  show_transactions: z.object({ month: optionalBound(/^\d{4}-(0[1-9]|1[0-2])$/), from: optionalBound(/^\d{4}-\d{2}-\d{2}$/), to: optionalBound(/^\d{4}-\d{2}-\d{2}$/), category: categoryFilter, limit: boundedLimit(15) }),
  set_budget: z.object({
    category: z.enum(CATEGORY_NAMES as [string, ...string[]]),
    monthlyLimit: z.number().positive("La limite doit être positive").max(1_000_000, "Limite invraisemblable")
  })
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;

/** Ce qu'un outil peut faire afficher à l'utilisateur, en marge de ce qu'il rend au modèle. */
export type AssistantBlock =
  | { type: "budget_proposal"; proposal: { category: string; monthlyLimit: number; currency: string } }
  | { type: "transactions"; month: string | null; category: string | null; transactions: Array<{ id: string; date: string; merchant: string; amount: number; currency: string; count: number; category: string }> };

/** Définitions transmises au modèle. `strict` impose la forme, Zod revalide au retour. */
export const TOOL_DEFINITIONS = [
  {
    name: "get_spending_summary",
    description: "Total dépensé sur un mois, comparé au mois précédent. À utiliser pour « combien ai-je dépensé en août ».",
    parameters: { type: "object", additionalProperties: false, required: ["month"], properties: { month: { type: "string", description: "AAAA-MM" } } }
  },
  {
    name: "get_spending_by_category",
    description: "Répartition des dépenses par catégorie entre deux dates. À utiliser pour « dans quoi part mon argent ».",
    parameters: { type: "object", additionalProperties: false, required: ["from", "to"], properties: { from: { type: "string", description: "AAAA-MM-JJ" }, to: { type: "string", description: "AAAA-MM-JJ, exclue" } } }
  },
  {
    name: "get_top_merchants",
    description: "Commerçants où le plus d'argent a été dépensé sur un mois.",
    parameters: { type: "object", additionalProperties: false, required: ["month"], properties: { month: { type: "string" }, limit: { type: "number" } } }
  },
  {
    name: "get_spending_between",
    description: "Total dépensé entre deux dates, éventuellement restreint à une catégorie. À utiliser pour des périodes qui ne sont pas des mois entiers.",
    parameters: { type: "object", additionalProperties: false, required: ["from", "to"], properties: { from: { type: "string" }, to: { type: "string" }, category: { type: "string", enum: CATEGORY_NAMES } } }
  },
  {
    name: "get_recent_transactions",
    description: "Liste de transactions sur une période. À n'utiliser que si le détail est nécessaire ; préférer les agrégats.",
    parameters: { type: "object", additionalProperties: false, required: ["from", "to"], properties: { from: { type: "string" }, to: { type: "string" }, limit: { type: "number", description: "50 au maximum" }, category: { type: "string", enum: CATEGORY_NAMES } } }
  },
  {
    name: "get_month_position",
    description: "Situe le mois parmi les mois passés à date égale : médiane, étendue de l'ordinaire, et position. À utiliser AVANT de qualifier un mois de fort ou de faible — un écart à la médiane qui reste dans l'étendue observée n'est pas une information.",
    parameters: { type: "object", additionalProperties: false, required: ["month"], properties: { month: { type: "string", description: "AAAA-MM" } } }
  },
  {
    name: "get_unusual_spending",
    description: "Par catégorie : dépensé ce mois, moyenne habituelle, écart, et famille (essentiels, quotidien, plaisirs, argent, santé). C'est l'outil de « où ai-je trop dépensé » et de « qu'est-ce qui n'était pas nécessaire » — la famille « plaisirs » désigne le discrétionnaire.",
    parameters: { type: "object", additionalProperties: false, required: ["month"], properties: { month: { type: "string", description: "AAAA-MM" } } }
  },
  {
    name: "get_subscriptions",
    description: "Prélèvements récurrents détectés : montant, fréquence, coût annuel, et hausse de tarif éventuelle. À utiliser pour conseiller des économies durables.",
    parameters: { type: "object", additionalProperties: false, required: [], properties: {} }
  },
  {
    name: "get_month_flows",
    description: "Ce qui est entré et ce qui est sorti sur un mois, et la différence. À utiliser avant tout conseil d'économie : une marge se mesure sur ce qui reste, pas sur ce qui est dépensé.",
    parameters: { type: "object", additionalProperties: false, required: ["month"], properties: { month: { type: "string", description: "AAAA-MM" } } }
  },
  {
    name: "get_all_time_totals",
    description: "Totaux depuis la première opération connue, par catégorie : ce qui est sorti, ce qui est rentré, le nombre d'opérations et la période couverte. C'est l'outil de « combien de virements ai-je faits depuis le début », « combien j'ai dépensé en tout », « depuis quand mes données remontent ». Il n'a aucun paramètre et couvre tout : un seul appel donne toutes les catégories.",
    parameters: { type: "object", additionalProperties: false, required: [], properties: {} }
  },
  {
    name: "show_largest_transactions",
    description: "Les plus grosses dépenses de TOUT l'historique du compte, toutes catégories confondues, sans aucune borne de date, affichées en liste cliquable. C'est l'outil de « ma plus grosse dépense », « depuis la création du compte », « toutes périodes confondues », « jamais ». Il se suffit d'un seul appel et n'accepte aucun filtre : ce qu'il rend est déjà le classement complet.",
    parameters: { type: "object", additionalProperties: false, required: [], properties: { limit: { type: "number", description: "15 au maximum" } } }
  },
  {
    name: "show_transactions",
    description: "Affiche à l'utilisateur des opérations classées de la plus grosse à la plus petite, sous forme de liste cliquable. À employer CHAQUE FOIS qu'une réponse énumérerait des dépenses : « montre-moi », « ma plus grosse dépense », « où ai-je trop dépensé », « ce qui n'était pas nécessaire », le détail d'un poste. AUCUN paramètre n'est obligatoire : sans mois ni dates, il couvre tout l'historique du compte — c'est ainsi qu'on répond à « depuis le début » ou « toutes périodes confondues ». Ne recopie jamais une liste d'opérations en texte : appelle cet outil, chaque ligne est cliquable.",
    parameters: { type: "object", additionalProperties: false, required: [], properties: { month: { type: "string", description: "AAAA-MM. Facultatif. Omets-le pour couvrir tout l'historique." }, from: { type: "string", description: "AAAA-MM-JJ. Facultatif, pour une période libre." }, to: { type: "string", description: "AAAA-MM-JJ, exclue. Facultatif." }, category: { type: "string", enum: CATEGORY_NAMES, description: "Facultatif. Omets-le pour couvrir toutes les catégories." }, limit: { type: "number", description: "15 au maximum, 6 à 8 suffisent" } } }
  },
  { name: "get_accounts", description: "Comptes bancaires et leurs soldes actuels.", parameters: { type: "object", additionalProperties: false, required: [], properties: {} } },
  { name: "get_budget_status", description: "Budgets définis, montant consommé et reste, pour un mois.", parameters: { type: "object", additionalProperties: false, required: ["month"], properties: { month: { type: "string" } } } },
  {
    name: "set_budget",
    description: "Prépare une proposition de limite mensuelle, sans écriture. Le client doit vérifier et confirmer dans Budgets. Ne jamais annoncer que le budget est enregistré.",
    parameters: { type: "object", additionalProperties: false, required: ["category", "monthlyLimit"], properties: { category: { type: "string", enum: CATEGORY_NAMES }, monthlyLimit: { type: "number", description: "Limite mensuelle, positive" } } }
  }
] as const;

/**
 * Un libellé de virement porte le nom d'une personne réelle. Ces noms n'ont aucune utilité
 * pour répondre à une question financière — « combien j'envoie chaque mois » se répond avec un
 * montant et une catégorie — et les transmettre à un tiers exposerait des contacts qui ne sont
 * pas l'utilisateur.
 */
const PERSON_TRANSFER = /^(?:TO|FROM)\s+\S/i;

/**
 * Une civilité suivie d'un nom désigne une personne, jamais un commerce.
 *
 * Constaté en interrogeant l'assistant sur un vrai relevé : « MR JOHN SMITH » a traversé le
 * masquage et s'est retrouvé cité dans une réponse — donc transmis au modèle. Ni le format
 * britannique « TO Nom » ni le format français structuré ne le couvraient : le libellé est le
 * nom seul, précédé de sa civilité.
 *
 * La forme est resserrée pour limiter les fausses alertes : une civilité, puis un ou deux mots
 * de lettres, sans chiffre, le tout court. « MR JOHN SMITH » passe, « DRIVE CARREFOUR » non
 * (pas de civilité isolée), « MRS FIELDS COOKIES 12 » non plus (un chiffre, trois mots).
 *
 * Il reste des collisions qu'aucune forme ne tranche — « MRS FIELDS COOKIES » sans numéro de
 * magasin est une enseigne réelle qui sera masquée. L'arbitrage est délibéré : sur-masquer coûte
 * le nom d'un commerçant dans une réponse, sous-masquer envoie l'identité d'une personne à un
 * tiers. Et le cas inverse — une personne dont le libellé ne porte pas de civilité — demeure
 * hors de portée : on ne distingue pas un nom propre d'une raison sociale par la seule forme.
 */
const CIVILITY = /^(?:M|MR|MS|MRS|MME|MLLE|DR)\.?\s+\p{L}[\p{L}'-]*(?:\s+\p{L}[\p{L}'-]*)?$/u;

export function redactCounterparty(merchant: string): string {
  const trimmed = merchant.trim();
  // Format britannique de Revolut : « TO Nom », « FROM Nom ». Le libellé entier est le nom.
  if (PERSON_TRANSFER.test(trimmed)) return trimmed.slice(0, 4).toUpperCase().startsWith("TO") ? "Virement émis" : "Virement reçu";
  if (trimmed.length <= 32 && CIVILITY.test(trimmed.toUpperCase())) return "Virement à un particulier";
  // Format français : le nom est enchâssé dans un libellé structuré, avec l'IBAN et les
  // références. Ne traiter que le cas britannique laissait « VIR INSTANTANE EMIS POUR: PAUL M
  // IBAN: …1234 » partir entier chez le modèle.
  return redactForAi(trimmed);
}

export function parseToolArguments(name: string, rawArguments: string): { ok: true; name: ToolName; args: unknown } | { ok: false; error: string } {
  if (!(name in TOOL_SCHEMAS)) return { ok: false, error: `Outil inconnu : ${name}` };
  let parsed: unknown;
  try {
    parsed = rawArguments.trim() ? JSON.parse(rawArguments) : {};
  } catch {
    return { ok: false, error: "Arguments illisibles : JSON invalide." };
  }
  const result = TOOL_SCHEMAS[name as ToolName].safeParse(parsed);
  if (!result.success) return { ok: false, error: result.error.issues.map((issue) => issue.message).join(" · ") };
  return { ok: true, name: name as ToolName, args: result.data };
}
