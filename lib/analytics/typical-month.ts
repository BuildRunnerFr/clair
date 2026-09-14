export interface MonthToDate {
  month: string;
  total: number;
}

export interface TypicalMonth {
  /** Cumul du mois affiché, arrêté au même jour que les mois de comparaison. */
  current: number;
  /** Le mois médian des mois passés à cette même date. */
  typical: number;
  /** L'étendue observée : ce qu'un mois « normal » recouvre réellement. */
  lowest: number;
  highest: number;
  monthsCompared: number;
  /** Écart au mois médian, en pourcentage. Null si aucun mois de comparaison. */
  changePercent: number | null;
  /**
   * Où le mois se situe par rapport aux mois passés. « ordinaire » tant qu'il reste dans
   * l'étendue déjà observée — auquel cas l'écart à la médiane ne constitue pas une nouvelle,
   * si grand soit-il.
   */
  position: "ordinaire" | "au-dessus" | "en-dessous";
}

/**
 * Situe le mois affiché parmi les mois passés, à date égale.
 *
 * Comparer au seul mois précédent fait passer pour une tendance ce qui n'est souvent qu'un
 * écart entre deux mois : un août calme après un juillet de vacances donne −30 % qui ne dit
 * rien de personne. La médiane de plusieurs mois est un repère plus stable.
 *
 * Les mois passés arrivent déjà filtrés : la requête n'énumère que ceux que le relevé bancaire
 * couvre, si bien qu'un zéro reçu ici est une vraie absence de dépense et non un trou de données.
 *
 * L'étendue est renvoyée avec elle, et c'est le point important. Mesurée sur les données
 * réelles, la dépense au même jour du mois varie de 19 à 72 % d'un mois à l'autre. Un écart de
 * 20 % à la médiane n'est donc pas un signal — c'est un mois ordinaire. Afficher le pourcentage
 * seul présenterait ce bruit comme une information ; l'accompagner de l'étendue laisse voir ce
 * qu'un mois normal recouvre.
 */
export function typicalMonth(points: MonthToDate[], month: string): TypicalMonth | null {
  const current = points.find((point) => point.month === month)?.total ?? 0;
  // Les zéros sont conservés : un mois où rien n'a été dépensé à cette date compte, et il est
  // fréquent en début de mois. Les mois que le relevé bancaire ne couvre pas sont écartés en
  // amont, par la requête — seule elle peut distinguer les deux cas.
  const past = points.filter((point) => point.month !== month).map((point) => point.total);
  if (!past.length) return null;

  const sorted = [...past].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const typical = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  const lowest = sorted[0]!;
  const highest = sorted[sorted.length - 1]!;

  return {
    current: round2(current),
    typical: round2(typical),
    lowest: round2(lowest),
    highest: round2(highest),
    monthsCompared: sorted.length,
    changePercent: typical > 0 ? Math.round(((current - typical) / typical) * 100) : null,
    position: current > highest ? "au-dessus" : current < lowest ? "en-dessous" : "ordinaire"
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
