/**
 * Ce qu'on consigne, et ce qu'on refuse de consigner.
 *
 * Un journal se relit des mois plus tard, souvent par quelqu'un qui n'avait pas à voir les
 * données de qui que ce soit — un prestataire, un futur associé, soi-même en déboguant devant
 * un écran partagé. Il ne doit donc contenir que des codes, des compteurs et des durées.
 *
 * Le filtre est une liste blanche de formes, pas une liste noire de mots : on ne peut pas
 * énumérer ce qui est sensible, mais on peut décider que seuls des nombres, des booléens et des
 * chaînes courtes sans espace ni chiffre long ont le droit d'entrer.
 */

export const EVENT_KINDS = [
  "bank_sync_failed",
  "bank_reauthorization_required",
  "categorization_failed",
  "assistant_failed",
  "quota_exceeded",
  "cron_sync_completed"
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];
export type EventSeverity = "info" | "warning" | "error";

/** Longueur au-delà de laquelle une chaîne cesse d'être un code pour devenir un contenu. */
const MAX_TEXT = 60;

/**
 * Ne laisse entrer dans le contexte que ce qui ne peut identifier personne.
 *
 * Les nombres et booléens passent. Les chaînes passent si elles ressemblent à un code : courtes,
 * sans espace, sans longue suite de chiffres. « reauthorization_required » entre ; « VIR
 * INSTANTANE POUR PAUL M » n'entre pas, et une référence à quinze chiffres non plus.
 */
export function safeContext(input: Record<string, unknown>): Record<string, number | boolean | string> {
  const out: Record<string, number | boolean | string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "string" && isCodeLike(value)) out[key] = value;
  }
  return out;
}

function isCodeLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_TEXT) return false;
  // Un espace signale une phrase, donc potentiellement un libellé recopié.
  if (/\s/.test(trimmed)) return false;
  // Six chiffres de suite : un identifiant, jamais un code d'erreur.
  if (/\d{6,}/.test(trimmed)) return false;
  return true;
}
