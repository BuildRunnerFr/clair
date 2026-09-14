"use client";

import { Select } from "@/components/select";

/**
 * Filters on the currency a transaction was *made* in. Amounts stay expressed in the user's
 * reporting currency whatever is picked here, so this narrows the set of transactions rather
 * than changing the unit they are counted in. Empty means all of them.
 */
/* Les libellés sont exigés et non fournis par défaut. Ils l'étaient, en français, écrits dans
   le composant : ils restaient donc tels quels dans l'interface anglaise, « Toutes devises » à
   côté de « All accounts ». Un défaut dans une langue est un oubli qui ne se signale pas. */
export function CurrencySelect({ currencies, value, name = "currency", allLabel, label }: { currencies: string[]; value: string | null; name?: string; allLabel: string; label: string }) {
  return <Select
    name={name}
    label={label}
    value={value ?? ""}
    options={[{ value: "", label: allLabel }, ...currencies.map((currency) => ({ value: currency, label: currency }))]}
    onChange={(choisie) => {
      // Secure hors développement : sans ce drapeau, le cookie voyage aussi en clair si une
      // requête part en HTTP, et un réseau intermédiaire peut alors le lire ou le poser.
      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `finance_currency=${encodeURIComponent(choisie)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    }}
  />;
}
