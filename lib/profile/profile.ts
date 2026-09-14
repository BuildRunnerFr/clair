import { z } from "zod";

/**
 * Le profil, et ce que chaque champ sert à faire.
 *
 * Demander une donnée personnelle exige d'avoir une raison de s'en servir : collectée « au cas
 * où », elle est un manquement au principe de minimisation, pas une précaution. D'où cette
 * liste, courte, où chaque ligne porte son usage.
 */
export const COUNTRIES = [
  // Les pays où l'agrégateur couvre des banques. La liste vit ici et non en base : elle change
  // avec la couverture, pas avec le schéma.
  { code: "FR", name: "France" },
  { code: "GB", name: "Royaume-Uni" },
  { code: "IE", name: "Irlande" },
  { code: "ES", name: "Espagne" },
  { code: "DE", name: "Allemagne" },
  { code: "IT", name: "Italie" },
  { code: "PT", name: "Portugal" },
  { code: "NL", name: "Pays-Bas" },
  { code: "BE", name: "Belgique" },
  { code: "AT", name: "Autriche" },
  { code: "PL", name: "Pologne" },
  { code: "LT", name: "Lituanie" },
  { code: "RO", name: "Roumanie" }
] as const;

export const COUNTRY_CODES = COUNTRIES.map((country) => country.code);
export type CountryCode = (typeof COUNTRIES)[number]["code"];

export const GENDERS = ["female", "male", "other", "undisclosed"] as const;
export type Gender = (typeof GENDERS)[number];

export interface Profile {
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  gender: Gender | null;
  country: CountryCode | null;
}

/** L'âge minimal d'un service financier. Vérifié, et non simplement demandé. */
export const MINIMUM_AGE = 18;

/**
 * Seuls le prénom et le pays sont exigés.
 *
 * Le prénom parce que toute la personnalisation en dépend, le pays parce que la couverture
 * bancaire est nationale et que sans lui on ne sait pas quelles banques proposer. Le reste
 * accepte le vide : un formulaire d'accueil qui bloque sur une case dont personne ne voit
 * l'utilité fait perdre l'utilisateur avant qu'il ait vu le produit.
 */
export const profileSchema = z.object({
  firstName: z.string().trim().min(1, "prénom requis").max(80),
  lastName: z.string().trim().max(80).optional().or(z.literal("")),
  birthDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  gender: z.enum(GENDERS).optional().or(z.literal("")),
  country: z.enum(COUNTRY_CODES as [CountryCode, ...CountryCode[]])
});

export type ProfileInput = z.infer<typeof profileSchema>;

/** Vrai lorsque la date fournie place la personne au-dessus de l'âge minimal. */
export function isOldEnough(birthDate: string, today = new Date()): boolean {
  const born = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(born.getTime()) || born.toISOString().slice(0, 10) !== birthDate) return false;
  const majority = new Date(born);
  majority.setUTCFullYear(majority.getUTCFullYear() + MINIMUM_AGE);
  return majority <= today;
}

/** Un profil est complet dès que les deux champs exigés sont là. */
export function isProfileComplete(profile: Profile | null): boolean {
  return Boolean(profile?.firstName && profile.country);
}

/**
 * Restreint la liste de fournisseurs au pays de l'utilisateur.
 *
 * Le filtre TrueLayer s'écrit « pays-type-fournisseur » : « fr-stet-societe-generale ». Une
 * variable d'environnement peut donc couvrir plusieurs pays, et il faut n'en montrer qu'un —
 * proposer neuf banques françaises à quelqu'un qui vit à Lisbonne n'est pas un défaut cosmétique,
 * c'est un écran où il ne trouve pas sa banque et s'arrête là.
 *
 * Sans pays connu, ou si le pays ne correspond à aucune entrée, la liste complète est renvoyée :
 * mieux vaut une liste trop large qu'une liste vide, qui ne proposerait aucune banque du tout.
 */
export function providersForCountry(providers: string | undefined, country: string | null): string | undefined {
  if (!providers || !country) return providers;
  const prefix = `${country.toLowerCase()}-`;
  const matching = providers.split(",").map((entry) => entry.trim()).filter((entry) => entry.startsWith(prefix));
  return matching.length ? matching.join(",") : providers;
}

/** « Bonjour Camille » plutôt que « Bonjour ». Le nom de famille n'a rien à faire dans un salut. */
export function greetingName(profile: Profile | null): string | null {
  return profile?.firstName?.trim() || null;
}
