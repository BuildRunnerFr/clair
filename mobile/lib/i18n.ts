import { getLocales } from "expo-localization";
import { createTranslate, negotiateLocale, type Translate } from "@/lib/i18n/catalogue";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";

/**
 * Les mêmes textes que le web, sans un mot recopié.
 *
 * C'est la raison pour laquelle le catalogue est un simple fichier JSON plutôt qu'une
 * bibliothèque liée à Next.js : il traverse la frontière web/natif tel quel. Une phrase corrigée
 * sur le site l'est ici aussi, et l'inverse.
 */
const CATALOGUES: Record<string, Record<string, string>> = { fr, en };

export function translateFor(languageTag: string | undefined): Translate {
  const locale = negotiateLocale(languageTag);
  return createTranslate(CATALOGUES[locale]!, fr);
}

/** La langue du téléphone, telle que le système la déclare. */
export function deviceTranslate(): Translate {
  return translateFor(getLocales()[0]?.languageTag);
}
