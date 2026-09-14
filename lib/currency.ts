const ISO_CURRENCY = /^[A-Z]{3}$/;

export function normalizeCurrency(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return ISO_CURRENCY.test(normalized) ? normalized : null;
}

export function formatMoney(amount: number, currency: string, locale = "fr-FR"): string {
  const normalized = normalizeCurrency(currency);
  if (!normalized) throw new RangeError("Code devise ISO invalide.");
  return new Intl.NumberFormat(locale, { style: "currency", currency: normalized }).format(amount);
}

/**
 * Une étendue de montants sous un seul symbole monétaire : « 605–1 326 € ».
 *
 * Les centimes sont écartés à dessein. Une étendue sert à situer un ordre de grandeur, et deux
 * montants au centime près dans une carte étroite se lisent moins bien qu'arrondis.
 */
export function formatMoneyRange(low: number, high: number, currency: string, locale = "fr-FR"): string {
  const normalized = normalizeCurrency(currency);
  if (!normalized) throw new RangeError("Code devise ISO invalide.");
  return new Intl.NumberFormat(locale, { style: "currency", currency: normalized, maximumFractionDigits: 0 }).formatRange(low, high);
}

/**
 * Un montant sans symbole ni décimales, pour les étiquettes qui tiennent leur devise d'ailleurs
 * — l'intérieur d'un graphique, dont la légende la porte déjà.
 *
 * Existe pour éviter de retirer le symbole d'un montant déjà formaté : une expression régulière
 * sur « € » laisse « $ » ou « £ » en place, et le graphique redevient illisible dès que la
 * devise principale change.
 */
export function formatAmountCompact(amount: number, locale = "fr-FR"): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount);
}

export function selectCurrency(available: string[], requested?: string, preferred?: string): string | null {
  const currencies = [...new Set(available.map(normalizeCurrency).filter((item): item is string => item !== null))];
  const requestedCurrency = requested ? normalizeCurrency(requested) : null;
  const preferredCurrency = preferred ? normalizeCurrency(preferred) : null;
  if (requestedCurrency && currencies.includes(requestedCurrency)) return requestedCurrency;
  if (preferredCurrency && currencies.includes(preferredCurrency)) return preferredCurrency;
  return currencies[0] ?? null;
}

/**
 * Les trois formats monétaires, liés une fois à une langue.
 *
 * Passer la langue à chacun des trente-quatre appels aurait marché, mais on en oublie un, et
 * l'oubli ne se voit que dans la langue qu'on ne parle pas. Lier une fois par composant rend la
 * faute impossible : soit la liaison est là, soit rien ne compile.
 */
export function moneyFormatter(locale: string) {
  return {
    money: (amount: number, currency: string) => formatMoney(amount, currency, locale),
    range: (low: number, high: number, currency: string) => formatMoneyRange(low, high, currency, locale),
    amount: (value: number) => formatAmountCompact(value, locale),
    headline: (amount: number, currency: string) => formatHeadline(amount, currency, locale)
  };
}

/**
 * Un montant de titre, qui doit tenir dans sa tuile.
 *
 * Les centimes se perdent au-delà de dix mille : « 103 484,99 € » demande cent vingt pixels dans
 * une tuile qui en offre quatre-vingt-dix-sept, et le symbole se fait couper — un montant amputé
 * de son unité est pire qu'un montant arrondi. Le retour à la ligne n'est pas une issue : le
 * séparateur de milliers français est une espace insécable, et forcer la coupure ailleurs
 * briserait le nombre au milieu de ses chiffres.
 *
 * En deçà du seuil, rien ne change : les centimes d'une dépense courante sont ce qu'on vient
 * vérifier, et le montant exact reste lisible partout ailleurs dans la page.
 */
function formatHeadline(amount: number, currency: string, locale: string) {
  const digits = Math.abs(amount) >= 10_000 ? 0 : 2;
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
}
