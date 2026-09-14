import type { Account, BudgetStatus } from "@/types/database";
import type { SqlDashboardSummary } from "@/types/analytics";
import type { StoredSubscription } from "@/lib/subscriptions/detect";
import type { DailySpend } from "@/lib/analytics/cashflow";

/**
 * Un tableau de bord d'exemple, pour la visite guidée d'un compte encore vide.
 *
 * Sans données, il n'y a rien à montrer : les cartes affichent des tirets et la visite désigne
 * du vide. Décrire une section vide revient à demander à quelqu'un d'imaginer ce qu'il verra,
 * ce qui est précisément le travail qu'on veut lui épargner.
 *
 * Ces chiffres ne sont jamais écrits en base et ne se mélangent jamais aux vrais : ils sont
 * construits à la volée, uniquement quand le compte ne contient aucune transaction, et
 * disparaissent à la première synchronisation. Un bandeau les annonce comme tels — laisser
 * croire, même une seconde, que ces montants sont les siens serait impardonnable sur un service
 * qui touche à l'argent.
 *
 * Les valeurs sont plausibles plutôt que rondes : un budget de « 500 € pile » et des dépenses
 * de « 1 000 € » se voient comme une maquette. Un relevé réel n'a pas de comptes ronds.
 */

const MONTH_LABELS = ["04", "05", "06", "07", "08", "09"] as const;

/** Le mois affiché, pour que l'exemple ne paraisse jamais périmé. */
function currentMonth(today: Date): string {
  return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function sampleAccounts(): Account[] {
  return [
    {
      id: "demo-compte-courant",
      userId: "demo",
      provider: "truelayer",
      providerAccountId: "demo-1",
      name: "Compte courant",
      currency: "EUR",
      balanceCurrent: 2418.36,
      balanceAvailable: 2418.36,
      balanceOverdraft: 500,
      balanceUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    },
    {
      id: "demo-livret",
      userId: "demo",
      provider: "truelayer",
      providerAccountId: "demo-2",
      name: "Livret A",
      currency: "EUR",
      balanceCurrent: 6150,
      balanceAvailable: 6150,
      balanceOverdraft: null,
      balanceUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }
  ];
}

/** Une date du mois écoulé, pour que l'échéance suivante tombe dans le mois en cours. */
function lastMonthOn(today: Date, day: number): string {
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, day));
  return date.toISOString().slice(0, 10);
}

export function sampleSubscriptions(today = new Date()): StoredSubscription[] {
  return [
    { merchantName: "SPOTIFY", latestAmount: 11.99, previousAmount: null, averageAmount: 11.99, currency: "EUR", frequency: "monthly", lastTransactionDate: lastMonthOn(today, 8) },
    { merchantName: "SFR", latestAmount: 24.99, previousAmount: 19.99, averageAmount: 22.49, currency: "EUR", frequency: "monthly", lastTransactionDate: lastMonthOn(today, 18) },
    { merchantName: "ASSURANCE HABITATION", latestAmount: 18.4, previousAmount: null, averageAmount: 18.4, currency: "EUR", frequency: "monthly", lastTransactionDate: lastMonthOn(today, 26) }
  ];
}

/**
 * Les encaissements réguliers de l'exemple : un salaire, sans lequel la prévision de solde ne
 * montrerait qu'une descente.
 */
export function sampleIncomes(today = new Date()): StoredSubscription[] {
  return [
    { merchantName: "SALAIRE", latestAmount: 2340, previousAmount: null, averageAmount: 2340, currency: "EUR", frequency: "monthly", lastTransactionDate: lastMonthOn(today, 28) }
  ];
}

/**
 * Douze mois de dépenses du quotidien, réparties sur quelques jours chacun.
 *
 * Douze et non trois : en dessous de neuf mois la bande de la prévision ne couvre pas assez pour
 * être tracée, et l'exemple ne montrerait pas ce que l'application sait faire. L'étendue entre
 * les mois est délibérée — c'est elle qui donne sa largeur à la bande, et une bande plate
 * laisserait croire à une prévision certaine.
 */
export function sampleDaily(today = new Date()): DailySpend[] {
  const totals = [1512, 1389, 1255, 1805, 1602, 1447, 1338, 1691, 1224, 1563, 1408, 1477];
  const shares = [0.17, 0.14, 0.21, 0.13, 0.19, 0.16];
  return totals.flatMap((total, index) => {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (totals.length - index), 1));
    const month = date.toISOString().slice(0, 7);
    return [2, 7, 12, 17, 22, 27].map((day, position) => ({ month, day, total: Math.round(total * shares[position]! * 100) / 100 }));
  });
}

export function sampleSummary(today = new Date()): SqlDashboardSummary {
  const month = currentMonth(today);
  const year = month.slice(0, 4);

  const budgetStatus: BudgetStatus[] = [
    { budgetId: "demo-1", category: "Groceries", currency: "EUR", monthlyLimit: 400, spent: 312.48, remaining: 87.52, percentageUsed: 78.1 },
    { budgetId: "demo-2", category: "Restaurants", currency: "EUR", monthlyLimit: 200, spent: 164.9, remaining: 35.1, percentageUsed: 82.5 },
    // Un budget dépassé dans l'exemple : c'est le cas qui donne son intérêt à la fonction, et
    // n'en montrer que des budgets tenus laisserait croire qu'elle ne sert à rien.
    { budgetId: "demo-3", category: "Transport", currency: "EUR", monthlyLimit: 120, spent: 147.3, remaining: -27.3, percentageUsed: 122.75 }
  ];

  return {
    baseCurrency: "EUR",
    totalSpent: 1487.62,
    pendingSpent: 23.9,
    previousMonthSpent: 1702.15,
    changePercent: -12.6,
    configuredBudget: 720,
    budgetRemaining: 95.32,
    byCategory: [
      { name: "Housing", amount: 612 },
      { name: "Groceries", amount: 312.48 },
      { name: "Restaurants", amount: 164.9 },
      { name: "Transport", amount: 147.3 },
      { name: "Subscriptions", amount: 55.38 },
      { name: "Health", amount: 41.2 }
    ],
    budgetStatus,
    topMerchants: [
      { name: "CARREFOUR MARKET", amount: 186.42 },
      { name: "SNCF CONNECT", amount: 94.6 },
      { name: "BOULANGERIE MARTIN", amount: 58.15 },
      { name: "PHARMACIE DU CENTRE", amount: 41.2 },
      { name: "SPOTIFY", amount: 11.99 }
    ],
    balanceHistory: buildBalanceHistory(month, today, sampleTotalBalance()),
    monthlyTrend: MONTH_LABELS.map((label, index) => ({
      month: `${year}-${label}`,
      spent: [1612.4, 1488.9, 1355.2, 1904.6, 1702.15, 1487.62][index]!
    })),
    income: 2340,
    outflow: 1487.62,
    transfersExcluded: 0,
    dailyDiscretionary: sampleDaily(today),
    typicalMonth: {
      current: 1487.62,
      typical: 1602.28,
      lowest: 1355.2,
      highest: 1904.6,
      monthsCompared: 5,
      changePercent: -7,
      position: "ordinaire"
    },
    latest: buildLatest(month)
  };
}

/**
 * Une courbe de solde qui décroît par paliers, comme un mois réel entre deux salaires.
 *
 * Elle s'arrête au jour du mois où l'on se trouve, comme la vraie : au-delà il n'y a rien à
 * relever, et la prévision prend le relais.
 *
 * Elle est construite à rebours du solde des comptes d'exemple, et non tirée d'une liste écrite
 * d'avance. Dans l'application, la reconstitution part du solde actuel : le dernier point vaut
 * donc exactement le total affiché au-dessus. Un exemple qui finirait ailleurs ferait démarrer
 * la prévision sur un autre chiffre que la courbe qu'elle prolonge.
 */
function buildBalanceHistory(month: string, today: Date, finalBalance: number) {
  // Un point par jour, comme la vraie série : à trois jours d'intervalle, la partie relevée
  // occuperait le tiers de la largeur qui lui revient et la prévision paraîtrait démesurée.
  const steps = [22, 0, 61, 4, 39, 0, 18, 74, 11, 0, 46, 29, 5, 63, 0, 33, 17, 52, 8, 0, 41, 26, 70, 3, 19, 0, 57, 12, 35, 9];
  const count = Math.max(2, today.getUTCDate());
  const used = Array.from({ length: count - 1 }, (_, index) => steps[index % steps.length]!);
  let running = finalBalance + used.reduce((total, step) => total + step, 0);
  return Array.from({ length: count }, (_, index) => {
    if (index > 0) running -= used[index - 1]!;
    return {
      day: `${month}-${String(index + 1).padStart(2, "0")}`,
      balance: Math.round(running * 100) / 100,
      // Les premiers points sont reconstitués, les derniers relevés : c'est le comportement réel,
      // les relevés prenant le relais à mesure que les synchronisations s'accumulent.
      reconstructed: index < count - 3
    };
  });
}

/** Le total des comptes d'exemple, d'où part la courbe comme la prévision. */
export function sampleTotalBalance(): number {
  return sampleAccounts().reduce((total, account) => total + (account.balanceCurrent ?? 0), 0);
}

function buildLatest(month: string) {
  const rows = [
    { merchant: "CARREFOUR MARKET", amount: -42.18, day: "08", category: "Groceries", sub: "Supermarket" },
    { merchant: "BOULANGERIE MARTIN", amount: -8.4, day: "08", category: "Groceries", sub: "Bakery" },
    { merchant: "SNCF CONNECT", amount: -23.9, day: "07", category: "Transport", sub: "Train", pending: true },
    { merchant: "SPOTIFY", amount: -11.99, day: "06", category: "Subscriptions", sub: "Streaming" },
    { merchant: "LE COMPTOIR", amount: -34.5, day: "05", category: "Restaurants", sub: "Restaurant" },
    { merchant: "PHARMACIE DU CENTRE", amount: -41.2, day: "04", category: "Health", sub: "Pharmacy" },
    { merchant: "TOTAL ENERGIES", amount: -68.9, day: "03", category: "Transport", sub: "Fuel" },
    { merchant: "SALAIRE", amount: 2340, day: "01", category: "Income", sub: "Salary" }
  ];
  return rows.map((row, index) => ({
    id: `demo-${index}`,
    providerTransactionId: `demo-${index}`,
    merchantName: row.merchant,
    description: row.merchant,
    amount: row.amount,
    currency: "EUR",
    amountBase: row.amount,
    baseCurrency: "EUR",
    transactionDate: `${month}-${row.day}T10:00:00.000Z`,
    category: row.category,
    subcategory: row.sub,
    pending: row.pending ?? false
  }));
}
