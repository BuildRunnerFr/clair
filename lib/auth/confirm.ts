export const EMAIL_OTP_TYPE = "email" as const;

/**
 * Les types de liens que l'on accepte de vérifier.
 *
 * Supabase n'en émet pas qu'un : `signup` confirme une adresse à la création du compte,
 * `recovery` ouvre une réinitialisation de mot de passe, `email` et `magiclink` servent la
 * connexion sans mot de passe. N'en accepter qu'un seul faisait échouer tous les autres avec un
 * « type de lien non reconnu » que rien n'expliquait à l'utilisateur.
 *
 * La liste reste fermée : le type décide de ce qui se passe après la vérification, et un type
 * inattendu ne doit pas emprunter le chemin d'un autre.
 */
export const CONFIRMATION_TYPES = ["email", "magiclink", "signup", "recovery"] as const;

export type ConfirmationType = (typeof CONFIRMATION_TYPES)[number];

export type ConfirmationInput = {
  tokenHash: string | null;
  type: string | null;
};

export function parseConfirmationInput(input: ConfirmationInput) {
  const tokenHash = input.tokenHash?.trim() ?? "";
  const type = input.type?.trim().toLowerCase() ?? "";
  if (!tokenHash) return { ok: false as const, reason: "missing_token" as const };
  if (!(CONFIRMATION_TYPES as readonly string[]).includes(type)) return { ok: false as const, reason: "invalid_type" as const };
  return { ok: true as const, tokenHash, type: type as ConfirmationType };
}

/**
 * Où mène un lien une fois vérifié.
 *
 * Une réinitialisation ouvre une session valide, mais l'utilisateur n'a pas encore de mot de
 * passe qu'il connaisse : l'envoyer au tableau de bord le laisserait connecté sur cet appareil
 * et enfermé dehors sur tous les autres.
 */
export function destinationFor(type: ConfirmationType): string {
  return type === "recovery" ? "/compte/mot-de-passe?reset=1" : "/dashboard";
}
