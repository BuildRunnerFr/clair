import "server-only";

import { cookies, headers } from "next/headers";
import { createTranslate, isLocale, negotiateLocale, type Locale, type Translate } from "./catalogue";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";

const CATALOGUES: Record<Locale, Record<string, string>> = { fr, en };

/**
 * Le catalogue d'une langue, complété par le français.
 *
 * Fusionné plutôt que passé en deux morceaux : le fournisseur client n'a alors qu'une table à
 * consulter, et une clé pas encore traduite affiche une phrase française lisible au lieu de son
 * identifiant.
 */
export function catalogueFor(locale: Locale): Record<string, string> {
  return locale === "fr" ? CATALOGUES.fr : { ...CATALOGUES.fr, ...CATALOGUES[locale] };
}

/** Cookie posé quand l'utilisateur choisit explicitement sa langue. */
export const LOCALE_COOKIE = "finance_locale";

/**
 * La langue de la requête en cours.
 *
 * Le choix explicite prime sur ce que le navigateur annonce : quelqu'un qui a demandé le
 * français sur un navigateur en anglais l'a fait exprès, et le contredire à chaque visite serait
 * la façon la plus sûre de le perdre.
 */
export async function currentLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return negotiateLocale((await headers()).get("accept-language"));
}

/**
 * La fonction de traduction pour la requête en cours.
 *
 * Le français sert de secours : une clé traduite nulle part affiche son identifiant, mais une
 * clé simplement pas encore traduite affiche une phrase lisible plutôt qu'un code.
 */
export async function getTranslations(): Promise<Translate> {
  const locale = await currentLocale();
  return createTranslate(CATALOGUES[locale], CATALOGUES.fr);
}
