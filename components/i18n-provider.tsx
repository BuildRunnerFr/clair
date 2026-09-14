"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createTranslate, intlLocale, type Catalogue, type Locale, type Translate } from "@/lib/i18n/catalogue";

/**
 * Rend les traductions accessibles aux composants clients.
 *
 * Les composants serveur appellent getTranslations() ; ceux qui tournent dans le navigateur ne
 * le peuvent pas. Passer chaque libellé en propriété fonctionne pour deux ou trois phrases, mais
 * devient illisible à quinze — et reste impossible pour app/error.tsx, que Next.js instancie
 * lui-même sans qu'aucun parent ne puisse lui transmettre quoi que ce soit.
 *
 * Le catalogue entier part au navigateur. C'est une centaine de chaînes courtes, soit moins
 * qu'une petite image, et cela évite de calculer un sous-ensemble par écran — un calcul qu'on
 * oublierait de mettre à jour en ajoutant une phrase.
 */
const TranslateContext = createContext<Translate | null>(null);

/** La langue courante, pour les formats de date et de nombre que Intl produit. */
const LocaleContext = createContext<Locale>("fr");

export function I18nProvider({ catalogue, locale, children }: { catalogue: Catalogue; locale: Locale; children: ReactNode }) {
  const translate = useMemo(() => createTranslate(catalogue), [catalogue]);
  return <LocaleContext.Provider value={locale}><TranslateContext.Provider value={translate}>{children}</TranslateContext.Provider></LocaleContext.Provider>;
}

/**
 * La fonction de traduction du navigateur.
 *
 * Renvoie la clé elle-même hors du fournisseur plutôt que de lever : une frontière d'erreur peut
 * se retrouver rendue au-dessus de lui, et un écran d'erreur qui plante lui-même en cherchant
 * comment dire « une erreur est survenue » est le pire des enchaînements.
 */
export function useTranslate(): Translate {
  return useContext(TranslateContext) ?? ((key) => key);
}

/** L'étiquette à passer à Intl. Le français par défaut, comme partout ailleurs. */
export function useIntlLocale(): string {
  return intlLocale(useContext(LocaleContext));
}
