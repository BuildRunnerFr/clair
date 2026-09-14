/**
 * Longueur minimale d'un mot de passe.
 *
 * Douze plutôt que huit : la longueur est le seul facteur qui résiste vraiment à une attaque
 * hors ligne, et c'est aussi le moins pénible à respecter. On n'impose ni chiffre, ni majuscule,
 * ni caractère spécial — ces règles produisent surtout des « Password1! » et poussent à réutiliser
 * un mot de passe qu'on retient, ce qui affaiblit davantage qu'elles ne protègent.
 */
export const MIN_PASSWORD_LENGTH = 12;

/** Supabase refuse au-delà de 72 octets ; le dire ici évite une erreur venue du serveur. */
export const MAX_PASSWORD_LENGTH = 72;

export type PasswordProblem = "too_short" | "too_long" | "email_as_password";

export function checkPassword(password: unknown, email?: string | null): PasswordProblem | null {
  const value = typeof password === "string" ? password : "";
  if (value.length < MIN_PASSWORD_LENGTH) return "too_short";
  // La longueur se compte en octets côté serveur : un mot de passe d'accents ou d'émojis peut
  // tenir en 72 caractères et dépasser 72 octets.
  if (new TextEncoder().encode(value).length > MAX_PASSWORD_LENGTH) return "too_long";
  // Son propre email est le premier mot de passe qu'on essaie sur un compte volé ailleurs.
  if (email && value.trim().toLowerCase() === email.trim().toLowerCase()) return "email_as_password";
  return null;
}

export const PASSWORD_MESSAGES: Record<PasswordProblem, string> = {
  too_short: `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`,
  too_long: "Ce mot de passe est trop long. Raccourcissez-le.",
  email_as_password: "Choisissez autre chose que votre adresse email."
};
