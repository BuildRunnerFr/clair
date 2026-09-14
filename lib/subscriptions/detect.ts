export interface RecurringInput {
  merchantName: string;
  amount: number;
  currency: string;
  transactionDate: string;
  pending?: boolean;
}

/** Ce que la table conserve. Le nombre d'occurrences sert à décider, pas à afficher. */
export interface StoredSubscription {
  merchantName: string;
  /** Dernier montant observé, utilisé comme estimation de la prochaine échéance. */
  latestAmount: number;
  /** Le montant précédent s'il différait, pour signaler une hausse ou une baisse. */
  previousAmount: number | null;
  averageAmount: number;
  currency: string;
  frequency: "weekly" | "monthly" | "yearly";
  lastTransactionDate: string;
}

export interface RecurringSubscription extends StoredSubscription {
  occurrences: number;
}

/**
 * Repère les dépenses qui reviennent à intervalle régulier pour un montant stable.
 *
 * Deux conditions, et les deux sont nécessaires. La régularité seule confondrait des courses
 * hebdomadaires avec un abonnement ; la stabilité du montant seule confondrait deux cafés du
 * même prix pris à trois mois d'écart. C'est leur conjonction qui caractérise un prélèvement.
 *
 * Le calcul est volontairement conservateur : mieux vaut manquer un abonnement que présenter
 * comme récurrente une dépense qui ne l'est pas — l'utilisateur irait chercher un prélèvement
 * inexistant.
 */

const CADENCES = [
  { frequency: "weekly" as const, days: 7, tolerance: 2 },
  { frequency: "monthly" as const, days: 30.4, tolerance: 6 },
  { frequency: "yearly" as const, days: 365, tolerance: 20 }
];

/**
 * Deux dates suffisent à former n'importe quel intervalle : à deux occurrences, la régularité
 * ne prouve rien par elle-même. Mais moins de points peut se compenser par une preuve plus
 * forte — au centime et au jour près, deux prélèvements ne doivent rien au hasard. D'où deux
 * régimes : trois occurrences avec une tolérance ordinaire, ou deux avec une tolérance
 * resserrée.
 *
 * Sans ce second régime, trois abonnements manifestes des données réelles étaient manqués :
 * 21,60 € puis 21,60 € à un mois jour pour jour, entre autres.
 */
const MIN_OCCURRENCES = 2;
const MAX_AMOUNT_DEVIATION = 0.25;
const STRICT_AMOUNT_DEVIATION = 0.05;
const STRICT_GAP_TOLERANCE = 0.4;

/**
 * Un revenu ne se reconnaît pas comme un abonnement.
 *
 * Les deux conditions valent pour un prélèvement : Spotify passe le même montant au même jour,
 * et une dépense dont le montant varie de moitié n'est pas un abonnement. Mesuré sur des données
 * réelles, un revenu ne ressemble pas à cela.
 *
 *   Salaire     écarts 33 28 33 30 28 30 32 29 30 33 29 jours — un métronome
 *               montants stables à 5 % près, puis quatre versements partiels — amplitude 103 %
 *   Allocation  écarts 12 30 31 31 28 33 28 31 12 19 30 30 — neuf sur douze mensuels
 *               montants du simple au décuple — amplitude 106 %
 *
 * Les deux étaient rejetés sur le montant, et le détecteur ne trouvait rien. Or c'est la cadence
 * qui porte le signal : un employeur paie tous les mois, le montant change avec les primes, les
 * congés ou un changement de poste. Une allocation se recalcule chaque trimestre et se rattrape
 * parfois à quinze jours d'intervalle.
 *
 * D'où deux régimes. Un prélèvement garde ses règles, qui ont fait leurs preuves. Un
 * encaissement ne se juge que sur sa régularité : cadence médiane reconnaissable, et une nette
 * majorité d'intervalles qui la respectent — les rattrapages sont admis, l'irrégularité totale
 * ne l'est pas. Vérifié : les remboursements Airbnb, espacés de 0, 390, 0, 3, 20, 0 et 9 jours,
 * restent écartés.
 */
const INCOME_GAP_CONFORMITY = 0.7;

export function detectSubscriptions(transactions: RecurringInput[], today = new Date()): RecurringSubscription[] {
  return detectRecurring(transactions, today, "debit");
}

/**
 * Les encaissements réguliers : un salaire, une pension, un loyer perçu.
 *
 * Un encaissement récurrent n'est pas un abonnement, et la liste des abonnements n'a pas à
 * l'accueillir. Mais la régularité se reconnaît de la même façon dans les deux sens — même
 * cadence, même stabilité du montant — et la prévision a besoin des deux : une courbe qui
 * descend des prélèvements sans jamais remonter du salaire décrit une ruine, pas un mois.
 */
export function detectRecurringIncome(transactions: RecurringInput[], today = new Date()): RecurringSubscription[] {
  return detectRecurring(transactions, today, "credit");
}

function detectRecurring(transactions: RecurringInput[], today: Date, direction: "debit" | "credit"): RecurringSubscription[] {
  const byMerchant = new Map<string, RecurringInput[]>();
  for (const transaction of transactions) {
    const date = new Date(transaction.transactionDate).getTime();
    if (transaction.pending || !Number.isFinite(transaction.amount) || !Number.isFinite(date)
      || date > today.getTime() || !transaction.merchantName.trim()) continue;
    // Le sens est un paramètre : un encaissement régulier se reconnaît exactement comme un
    // prélèvement, et seule la direction du montant les distingue.
    if (direction === "debit" ? transaction.amount >= 0 : transaction.amount <= 0) continue;
    const key = `${transaction.merchantName}\u0000${transaction.currency}`;
    byMerchant.set(key, [...(byMerchant.get(key) ?? []), transaction]);
  }

  const found: RecurringSubscription[] = [];
  for (const group of byMerchant.values()) {
    if (group.length < MIN_OCCURRENCES) continue;
    const sorted = [...group].sort((left, right) => left.transactionDate.localeCompare(right.transactionDate));
    const amounts = sorted.map((item) => Math.abs(item.amount));
    const sparse = sorted.length < 3;
    const reference = median(amounts);
    if (reference <= 0) continue;
    if (direction === "debit") {
      // L'amplitude entre le plus petit et le plus grand montant, et non l'écart à la médiane :
      // ce dernier divise par deux l'écart réel, et un seuil de 5 % en tolérait alors 10.
      const spread = (Math.max(...amounts) - Math.min(...amounts)) / reference;
      if (spread > (sparse ? STRICT_AMOUNT_DEVIATION : MAX_AMOUNT_DEVIATION)) continue;
    }

    const gaps = sorted.slice(1).map((item, index) => daysBetween(sorted[index]!.transactionDate, item.transactionDate));
    const typical = median(gaps);
    const cadence = CADENCES.find((candidate) => Math.abs(typical - candidate.days) <= candidate.tolerance * (sparse ? STRICT_GAP_TOLERANCE : 1));
    if (!cadence) continue;
    const tolerance = cadence.tolerance * (sparse ? STRICT_GAP_TOLERANCE : 1);
    const conforming = gaps.filter((gap) => Math.abs(gap - cadence.days) <= tolerance).length;
    if (direction === "debit") {
      // Chaque intervalle doit tenir dans la tolérance, pas seulement leur médiane : sans cela,
      // une série irrégulière dont les écarts se compensent passerait pour régulière.
      if (conforming < gaps.length) continue;
    } else if (conforming / gaps.length < INCOME_GAP_CONFORMITY) continue;

    const last = sorted[sorted.length - 1]!;
    // Une échéance manquante rend la détection trop ancienne. Cela ne prouve pas une
    // résiliation : la banque peut aussi ne pas avoir transmis toutes les opérations.
    if (daysBetween(last.transactionDate, today.toISOString()) > cadence.days + cadence.tolerance) continue;

    /**
     * Ce qui tombera la prochaine fois.
     *
     * Le dernier montant, pour un prélèvement : c'est celui que la banque repassera. Pour un
     * revenu, la médiane des trois derniers — assez robuste pour ignorer un versement isolé,
     * assez récente pour suivre un changement de situation. Un salaire passé de deux mille
     * à deux cents euros ne reviendra pas à deux mille parce que c'était sa
     * médiane sur deux ans.
     */
    const latestAmount = direction === "debit"
      ? Math.abs(last.amount)
      : round2(median(amounts.slice(-3)));
    const previous = sorted.length > 1 ? Math.abs(sorted[sorted.length - 2]!.amount) : null;
    found.push({
      merchantName: last.merchantName,
      latestAmount: round2(latestAmount),
      previousAmount: previous !== null && Math.abs(previous - latestAmount) > 0.005 ? round2(previous) : null,
      averageAmount: round2(amounts.reduce((total, amount) => total + amount, 0) / amounts.length),
      currency: last.currency,
      frequency: cadence.frequency,
      lastTransactionDate: last.transactionDate,
      occurrences: sorted.length
    });
  }

  return found.sort((left, right) => right.latestAmount - left.latestAmount);
}

/** Coût annualisé, la seule façon de comparer un abonnement mensuel à un abonnement annuel. */
/** Projeté sur le dernier montant, seul à valoir pour l'avenir. */
export function yearlyCost(subscription: StoredSubscription): number {
  const perYear = subscription.frequency === "weekly" ? 52 : subscription.frequency === "monthly" ? 12 : 1;
  return round2(subscription.latestAmount * perYear);
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function daysBetween(from: string, to: string): number {
  return Math.abs(new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** La liste ne doit pas rester active indéfiniment entre deux synchronisations. */
export function isRecurringCurrent(item: StoredSubscription, today = new Date()): boolean {
  const cadence = CADENCES.find(candidate => candidate.frequency === item.frequency);
  const age = (today.getTime() - new Date(item.lastTransactionDate).getTime()) / 86_400_000;
  return Boolean(cadence && Number.isFinite(age) && age >= 0 && age <= cadence.days + cadence.tolerance);
}
