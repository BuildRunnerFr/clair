import type { StoredSubscription } from "@/lib/subscriptions/detect";

/**
 * La trésorerie attendue jusqu'à la fin du mois.
 *
 * Une projection de dépenses a déjà été tentée ici, puis abandonnée : extrapoler le rythme du
 * début de mois donnait 89 % d'erreur médiane au dixième jour, et un chiffre faux sur de
 * l'argent est pire qu'un chiffre absent.
 *
 * Celle-ci est construite autrement, et c'est toute la différence. Elle ne part pas de rien :
 * elle part du solde réel, qui est mesuré, et lui applique trois termes de nature différente.
 *
 *   1. Les prélèvements récurrents, à leur date attendue. Connus au montant et au jour près.
 *   2. Les encaissements récurrents — le salaire. Connus de la même façon.
 *   3. Le reste : les dépenses du quotidien, qui elles s'estiment.
 *
 * Seul le troisième terme est incertain, et il est mesuré plutôt que déduit : on regarde ce qui
 * a réellement été dépensé, hors récurrent, sur cette même fin de mois les mois précédents. La
 * médiane donne la courbe, l'étendue donne la bande — et c'est la bande qui rend la prévision
 * honnête, en montrant l'incertitude au lieu d'afficher une fausse précision.
 *
 * Les deux premiers termes sont ceux qui donnent sa forme à la courbe : le décrochement du
 * loyer, la remontée du salaire. Une droite décroissante n'aurait rien appris à personne.
 */

export interface DatedFlow {
  merchantName: string;
  /** Toujours positif ; le sens est porté par `kind`. */
  amount: number;
  date: string;
  kind: "debit" | "credit";
}

export interface ForecastPoint {
  day: string;
  expected: number;
  /** Bande d'incertitude, issue de l'étendue observée des dépenses non récurrentes. */
  low: number;
  high: number;
}

export interface DiscretionaryOutlook {
  typical: number;
  low: number;
  high: number;
  /** Nombre de mois passés ayant servi de comparaison. Zéro rend la prévision impossible. */
  monthsObserved: number;
}

export interface CashflowForecast {
  /** Le solde d'où part la courbe. Mesuré, non estimé. */
  startBalance: number;
  points: ForecastPoint[];
  /** Ce qui est attendu d'ici la fin du mois, daté. */
  upcoming: DatedFlow[];
  /** Somme des prélèvements récurrents restant à passer. */
  committed: number;
  /** Somme des encaissements récurrents attendus. */
  expectedIncome: number;
  discretionary: DiscretionaryOutlook;
  /** Part des mois qu'une bande min/max sur cet historique contient : (n − 1) / (n + 1). */
  coverage: number;
  /** Ce qui reste après les seuls engagements connus, avant dépenses du quotidien. */
  available: number;
  /** Solde attendu au dernier jour du mois. Null quand l'historique ne permet pas de courbe. */
  endBalance: number | null;
}

/** Une journée de dépenses non récurrentes, telle que la base la renvoie. */
export interface DailySpend {
  month: string;
  day: number;
  total: number;
}

const MAX_OCCURRENCES = 400;

/**
 * Le nombre de mois passés en dessous duquel la bande ne vaut rien.
 *
 * Une bande tracée entre le minimum et le maximum de n mois contient le mois suivant avec la
 * probabilité (n − 1) / (n + 1). C'est un résultat de rangs : il ne dépend ni de la forme de la
 * distribution ni du montant, seulement du nombre d'observations. Vérifié par simulation sur une
 * loi normale et sur une loi à queue lourde — 33 % à deux mois, 80 % à neuf, 92 % à vingt-trois.
 *
 * Mesuré sur l'historique réel avec deux mois de comparaison : 33 % de couverture, exactement la
 * valeur prédite. Une bande qui manque deux fois sur trois est pire que pas de bande — elle
 * donne à une incertitude l'apparence d'une maîtrise.
 *
 * Neuf mois portent la couverture à 80 %. En dessous, la courbe ne s'affiche pas : les
 * engagements datés, eux, restent exacts et continuent d'être annoncés.
 */
export const MIN_MONTHS_FOR_BAND = 9;

/**
 * Les occurrences attendues d'un flux récurrent dans une fenêtre.
 *
 * La cadence mensuelle est projetée en mois calendaires depuis la dernière occurrence, et non
 * par pas de 30,4 jours : un loyer tombe le 5, pas « trente jours et demi plus tard ». Sur six
 * mois, le pas moyen décale la date de deux jours — assez pour placer un prélèvement du mauvais
 * côté d'une fin de mois.
 *
 * Le décalage se calcule toujours depuis l'ancre, jamais de proche en proche : un prélèvement du
 * 31 janvier ramené au 28 février doit revenir au 31 mars, et non rester au 28.
 */
export function expectedOccurrences(flow: StoredSubscription, from: Date, to: Date, kind: "debit" | "credit" = "debit"): DatedFlow[] {
  const anchor = new Date(flow.lastTransactionDate);
  if (Number.isNaN(anchor.getTime())) return [];
  const found: DatedFlow[] = [];
  for (let step = 1; step <= MAX_OCCURRENCES; step++) {
    const date = shift(anchor, flow.frequency, step);
    if (date > to) break;
    if (date >= from) found.push({ merchantName: flow.merchantName, amount: flow.latestAmount, date: iso(date), kind });
  }
  return found;
}

function shift(anchor: Date, frequency: StoredSubscription["frequency"], step: number): Date {
  if (frequency === "weekly") return new Date(anchor.getTime() + step * 7 * 86_400_000);
  const months = frequency === "yearly" ? step * 12 : step;
  const day = anchor.getUTCDate();
  const target = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + months, 1));
  // Le 31 n'existe pas tous les mois : le prélèvement passe alors le dernier jour, comme à la banque.
  target.setUTCDate(Math.min(day, daysInMonth(target.getUTCFullYear(), target.getUTCMonth())));
  return target;
}

/**
 * Ce qui a réellement été dépensé, hors récurrent, sur cette même fin de mois les mois passés.
 *
 * Formulé directement comme la quantité cherchée — « du 6 à la fin du mois » — plutôt que
 * reconstruit à partir d'un rythme quotidien : la question posée à la donnée est exactement
 * celle à laquelle on veut répondre, et l'étendue vient avec la réponse.
 *
 * Un mois entièrement absent du relevé ne produit aucune ligne et ne compte donc pas ; un mois
 * couvert mais sans dépense non récurrente sur la période n'en produit pas davantage, et manque
 * lui aussi. Le biais est vers le haut — on surestime plutôt qu'on ne rassure —, ce qui est le
 * bon sens de l'erreur pour un chiffre d'argent.
 */
export function discretionaryOutlook(rows: DailySpend[], currentMonth: string, afterDay: number): DiscretionaryOutlook {
  const byMonth = new Map<string, number>();
  for (const row of rows) {
    if (row.month === currentMonth || row.day <= afterDay) continue;
    byMonth.set(row.month, (byMonth.get(row.month) ?? 0) + row.total);
  }
  const totals = [...byMonth.values()].sort((left, right) => left - right);
  if (!totals.length) return { typical: 0, low: 0, high: 0, monthsObserved: 0 };
  return {
    typical: round2(median(totals)),
    low: round2(totals[0]!),
    high: round2(totals[totals.length - 1]!),
    monthsObserved: totals.length
  };
}

/**
 * La courbe, jour par jour, du lendemain à la fin du mois.
 *
 * Les dépenses du quotidien sont réparties uniformément sur les jours restants. On pourrait
 * suivre le profil observé — davantage juste après la paie — mais avec trois mois d'historique
 * ce profil est du bruit qu'on prendrait pour une forme. Uniforme est ce que la donnée permet
 * d'affirmer ; les décrochements datés viennent des prélèvements, qui eux sont connus.
 */
export function forecastCashflow(input: {
  startBalance: number;
  today: Date;
  subscriptions: StoredSubscription[];
  incomes: StoredSubscription[];
  daily: DailySpend[];
  currency: string;
}): CashflowForecast | null {
  const { startBalance, today, currency } = input;
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const lastDay = daysInMonth(year, month);
  const currentMonth = `${year}-${String(month + 1).padStart(2, "0")}`;
  const from = new Date(Date.UTC(year, month, today.getUTCDate() + 1));
  const to = new Date(Date.UTC(year, month, lastDay));

  const discretionary = discretionaryOutlook(input.daily, currentMonth, today.getUTCDate());
  const sameCurrency = (flow: StoredSubscription) => flow.currency === currency;
  const upcoming = [
    ...input.subscriptions.filter(sameCurrency).flatMap((item) => expectedOccurrences(item, from, to, "debit")),
    ...input.incomes.filter(sameCurrency).flatMap((item) => expectedOccurrences(item, from, to, "credit"))
  ].sort((left, right) => left.date.localeCompare(right.date));

  const committed = round2(sum(upcoming.filter((flow) => flow.kind === "debit").map((flow) => flow.amount)));
  const expectedIncome = round2(sum(upcoming.filter((flow) => flow.kind === "credit").map((flow) => flow.amount)));

  const remainingDays = lastDay - today.getUTCDate();
  const perDay = (total: number) => total / remainingDays;
  const running = { expected: startBalance, low: startBalance, high: startBalance };
  const points: ForecastPoint[] = [];

  /**
   * Une prévision de solde sans revenu connu n'est pas une prévision, c'est une chute.
   *
   * Le calcul soustrait des dépenses d'un solde de départ. Si rien n'est attendu en sens
   * inverse, il ne peut décrire qu'un appauvrissement continu, et il l'annonce d'autant plus
   * fort que les dépenses passées étaient élevées. Constaté en usage : trois cent un euros au
   * compte, une prévision à moins quatre mille sept cents, et la courbe réellement mesurée
   * écrasée sur trois pour cent de la hauteur du dessin par une bande qui descendait quinze fois
   * plus bas que le solde.
   *
   * Ce n'est pas une échelle mal choisie, c'est un modèle incomplet : quand la détection des
   * encaissements réguliers ne trouve rien — un salaire versé sous un libellé changeant, une
   * activité payée irrégulièrement —, il manque au calcul la moitié de ce qu'il faudrait pour
   * conclure. On s'en tient alors aux échéances datées, qui sont exactes, et on renonce à la
   * courbe. Mieux vaut ne rien dire que d'annoncer la ruine à quelqu'un qui sera payé demain.
   */
  const projectsRuin = expectedIncome === 0 && startBalance - discretionary.typical < 0;
  const bandIsMeaningful = discretionary.monthsObserved >= MIN_MONTHS_FOR_BAND && remainingDays > 0 && !projectsRuin;
  if (bandIsMeaningful) {
    for (let day = today.getUTCDate() + 1; day <= lastDay; day++) {
      const iso = `${currentMonth}-${String(day).padStart(2, "0")}`;
      const net = sum(upcoming.filter((flow) => flow.date === iso).map((flow) => flow.kind === "credit" ? flow.amount : -flow.amount));
      running.expected += net - perDay(discretionary.typical);
      // La bande la plus basse suppose la dépense la plus forte observée, et réciproquement.
      running.low += net - perDay(discretionary.high);
      running.high += net - perDay(discretionary.low);
      points.push({ day: iso, expected: round2(running.expected), low: round2(running.low), high: round2(running.high) });
    }
  }

  if (!points.length && !upcoming.length) return null;
  return {
    startBalance: round2(startBalance),
    points,
    upcoming,
    committed,
    expectedIncome,
    discretionary,
    /** (n − 1) / (n + 1) : la part des mois qu'une bande min/max sur n mois contient. */
    coverage: discretionary.monthsObserved > 1 ? (discretionary.monthsObserved - 1) / (discretionary.monthsObserved + 1) : 0,
    available: round2(startBalance - committed),
    endBalance: points.length ? round2(running.expected) : null
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function median(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
