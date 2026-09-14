/**
 * Traduction des textes de l'interface.
 *
 * Un catalogue JSON et une fonction, plutôt qu'une bibliothèque. Le choix tient à la suite :
 * un fichier de messages se réutilise tel quel dans une application React Native, alors que la
 * machinerie d'un greffon Next.js ne franchit pas cette frontière. Cette partie-là du travail
 * ne sera donc pas à refaire.
 *
 * Les clés sont hiérarchiques par écran — « dashboard.spentThisMonth » — pour qu'on retrouve
 * une chaîne à partir de l'endroit où on l'a vue, ce qui est la seule façon dont on les cherche.
 */

export type Catalogue = Record<string, string>;
export type Translate = (key: string, values?: Record<string, string | number>) => string;

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

/**
 * L’étiquette BCP 47 à donner à Intl pour chaque langue.
 *
 * « en-GB » et non « en-US » : les utilisateurs visés sont européens, et l'anglais américain
 * écrirait le 9 avril « 4/9/2026 » — une date qu'un Européen lit comme le 4 septembre. Une
 * ambiguïté silencieuse sur une date de transaction est pire qu'une traduction manquante.
 */
export const INTL_LOCALES: Record<Locale, string> = { fr: "fr-FR", en: "en-GB" };

export function intlLocale(locale: Locale): string {
  return INTL_LOCALES[locale];
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Choisit la langue à partir de ce que le navigateur annonce.
 *
 * On ne lit que la première langue reconnue, sans pondération : les facteurs de qualité de
 * l'en-tête Accept-Language servent à départager des variantes régionales, pas à choisir entre
 * deux langues qu'on sait toutes deux traduire.
 */
export function negotiateLocale(header: string | null | undefined): Locale {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase() ?? "";
    const base = tag.split("-")[0] ?? "";
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/**
 * Construit la fonction de traduction.
 *
 * Une clé absente renvoie la clé elle-même plutôt qu'un vide : sur une page, « budgets.title »
 * se remarque et se corrige, tandis qu'un blanc passe inaperçu jusqu'à ce qu'un utilisateur le
 * signale. Le repli sur le français vient d'abord, pour qu'une traduction incomplète laisse
 * lire une phrase plutôt qu'un identifiant.
 */
export function createTranslate(catalogue: Catalogue, fallback?: Catalogue): Translate {
  return (key, values) => {
    const template = catalogue[key] ?? fallback?.[key] ?? key;
    return values ? interpolate(template, values) : template;
  };
}

/**
 * Remplace les marques « {nom} » par leur valeur.
 *
 * Une marque sans valeur correspondante est laissée telle quelle. La supprimer produirait une
 * phrase grammaticalement correcte mais fausse — « Il reste  transactions » — qu'on ne
 * remarquerait pas à la relecture.
 */
function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match);
}
