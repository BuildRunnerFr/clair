/**
 * Retire d'un libellé bancaire ce qui n'a pas à sortir de l'application.
 *
 * Un libellé de virement français porte le nom d'un tiers — « VIR INSTANTANE EMIS WERO POUR:
 * PAUL M » — une fin d'IBAN et des références. Ces gens ne sont pas l'utilisateur, ils n'ont
 * jamais accepté quoi que ce soit, et leur nom n'aide en rien à classer une dépense : un
 * virement est un virement, quel qu'en soit le destinataire.
 *
 * Le masquage s'applique à ce qui part chez le fournisseur d'IA, pas à ce qui est stocké. Le
 * libellé complet reste en base, où l'utilisateur doit pouvoir le lire pour reconnaître son
 * opération — c'est sa donnée, et le lui amputer ne protégerait personne.
 *
 * Une nuance décide de la qualité du classement : sur un **prélèvement**, la contrepartie est
 * un organisme, et c'est précisément le signal utile — « PRET CREDIMODELE » dit qu'il
 * s'agit d'un crédit. On ne masque donc la contrepartie que sur les **virements**, où elle est
 * une personne.
 */

const PLACEHOLDER = "[TIERS]";
const MASKED = "[MASQUÉ]";

/** Un virement : la contrepartie y est une personne. Un prélèvement : c'est un organisme. */
const TRANSFER = /\bVIR(?:EMENT|\s|\.)|^VIR\b/i;

/** Les mots qui bornent le nom d'une contrepartie dans un libellé bancaire français. */
const FIELD_BOUNDARY = "IBAN|DATE|REF|MOTIF|ID|BQ|CPT";

const COUNTERPARTY = new RegExp(`\\b(POUR|DE)\\s*:?\\s+(.+?)(?=\\s+(?:${FIELD_BOUNDARY})\\b\\s*:?|$)`, "gi");

export function redactForAi(value: string): string {
  if (!value) return "";
  let out = value.normalize("NFKC");

  // Adresses et liens : jamais utiles pour classer, toujours identifiants.
  out = out.replace(/https?:\/\/\S+|\b\S+@\S+\.\S+\b/gi, MASKED);

  // IBAN complet, puis la forme déjà tronquée par la banque (XXXXXXXX1234), qui reste un
  // identifiant de compte : ses quatre derniers chiffres suffisent à rapprocher deux relevés.
  out = out.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/gi, MASKED);
  out = out.replace(/\bX{4,}[\dX]*\b/gi, MASKED);

  // Le nom du tiers, sur les seuls virements.
  if (TRANSFER.test(out)) {
    out = out.replace(COUNTERPARTY, (_match, field: string) => `${field.toUpperCase()}: ${PLACEHOLDER}`);
  }

  // Références et numéros d'opération : six chiffres ou plus, espaces et tirets tolérés à
  // l'intérieur mais jamais à la fin — une borne haute laissait passer les références plus
  // longues qu'elle, faute de frontière de mot au milieu d'un nombre.
  out = out.replace(/\b\d(?:[ -]?\d){5,}\b/g, MASKED);

  // Un libellé utile tient en une centaine de caractères ; au-delà ce sont des identifiants.
  return out.replace(/\s+/g, " ").trim().slice(0, 120);
}
