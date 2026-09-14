import { describe, expect, it } from "vitest";
import { SCENARIOS } from "./fixtures/scenarios";
import { buildAccounts, buildSummary } from "./fixtures/build-summary";
import { forecastCashflow } from "@/lib/analytics/cashflow";
import { detectRecurringIncome, detectSubscriptions } from "@/lib/subscriptions/detect";
import { budgetAlerts } from "@/lib/analytics/budget-alerts";
import { budgetLevel } from "@/lib/analytics/month";
import { moneyFormatter } from "@/lib/currency";
import { colorOf } from "@/lib/categories/families";

/**
 * Neuf situations passées au crible, dont les bords : un mois vide, un solde négatif, un
 * marchand au nom de quatre-vingts caractères, un montant à six chiffres, deux devises.
 *
 * Ce que ces épreuves cherchent n'est pas l'exactitude d'un montant — c'est qu'aucune situation
 * ne produise ce qu'une interface ne sait pas afficher : un NaN, un infini, un pourcentage sur
 * une division par zéro, une bande dont le bas passe au-dessus du haut. Chacune de ces valeurs
 * se rend en silence à l'écran, et se lit comme une donnée.
 */
const finite = (value: unknown, label: string) => {
  expect(typeof value, `${label} devrait être un nombre`).toBe("number");
  expect(Number.isFinite(value as number), `${label} vaut ${value}`).toBe(true);
};

describe.each(SCENARIOS.map((scenario) => [scenario.name, scenario] as const))("scénario « %s »", (_name, scenario) => {
  const summary = buildSummary(scenario);
  const accounts = buildAccounts(scenario);
  const flows = scenario.movements.map((item) => ({
    merchantName: item.merchant, amount: item.amount,
    currency: item.currency ?? summary.baseCurrency, transactionDate: `${item.date}T10:00:00.000Z`
  }));

  it("ne produit aucun nombre inaffichable", () => {
    for (const key of ["totalSpent", "pendingSpent", "previousMonthSpent", "configuredBudget", "budgetRemaining", "income", "outflow", "transfersExcluded"] as const) {
      finite(summary[key], key);
    }
    summary.byCategory.forEach((row) => finite(row.amount, `catégorie ${row.name}`));
    summary.topMerchants.forEach((row) => finite(row.amount, `marchand ${row.name}`));
    summary.monthlyTrend.forEach((row) => finite(row.spent, `mois ${row.month}`));
    summary.balanceHistory.forEach((row) => finite(row.balance, `solde ${row.day}`));
    summary.budgetStatus.forEach((row) => {
      finite(row.spent, `budget ${row.category}`);
      if (row.percentageUsed !== null) finite(row.percentageUsed, `pourcentage ${row.category}`);
    });
  });

  it("garde ses totaux cohérents", () => {
    const categories = summary.byCategory.reduce((total, row) => total + row.amount, 0);
    expect(Math.abs(categories - summary.totalSpent)).toBeLessThan(0.05);
    // Le premier marchand ne peut pas dépasser le total du mois.
    if (summary.topMerchants.length) expect(summary.topMerchants[0]!.amount).toBeLessThanOrEqual(summary.totalSpent + 0.01);
    // Les marchands arrivent du plus gros au plus petit ; l'inverse ferait mentir la numérotation.
    const amounts = summary.topMerchants.map((row) => row.amount);
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
  });

  it("formate chaque montant sans casser", () => {
    const { money } = moneyFormatter("fr-FR");
    for (const value of [summary.totalSpent, summary.income, summary.outflow, summary.budgetRemaining]) {
      const rendered = money(value, summary.baseCurrency);
      expect(rendered).not.toContain("NaN");
      expect(rendered).not.toContain("Infinity");
      expect(rendered.length).toBeGreaterThan(0);
    }
    // Un montant à six chiffres ne doit pas perdre ses décimales ni son séparateur.
    expect(money(98765.43, "EUR")).toMatch(/98\s?765,43/);
  });

  it("donne une couleur à chaque catégorie affichée", () => {
    for (const row of summary.byCategory) {
      expect(colorOf(row.name), `catégorie sans couleur : ${row.name}`).toMatch(/^var\(--family-/);
    }
  });

  it("classe chaque budget dans un niveau connu", () => {
    for (const status of summary.budgetStatus) {
      expect(["none", "ok", "warning", "over"]).toContain(budgetLevel(status.percentageUsed));
    }
    // Une alerte ne se lève que sur un budget réellement dépassé ou proche de l'être.
    for (const alert of budgetAlerts(summary.budgetStatus)) {
      const status = summary.budgetStatus.find((row) => row.category === alert.category)!;
      expect(status.percentageUsed).toBeGreaterThanOrEqual(80);
    }
  });

  it("ne projette une courbe que si elle a un sens, et la garde ordonnée", () => {
    const currencyAccounts = accounts.filter((account) => account.currency === summary.baseCurrency);
    const balance = currencyAccounts.reduce((total, account) => total + (account.balanceCurrent ?? 0), 0);
    const forecast = forecastCashflow({
      startBalance: balance, today: scenario.today,
      subscriptions: detectSubscriptions(flows, scenario.today),
      incomes: detectRecurringIncome(flows, scenario.today),
      daily: summary.dailyDiscretionary, currency: summary.baseCurrency
    });
    if (!forecast) return;
    finite(forecast.available, "disponible");
    finite(forecast.committed, "engagements");
    for (const point of forecast.points) {
      finite(point.expected, `prévu ${point.day}`);
      // La bande encadre la ligne : l'inverse se lirait comme une donnée et n'en est pas une.
      expect(point.low, `bande inversée le ${point.day}`).toBeLessThanOrEqual(point.expected + 0.01);
      expect(point.high, `bande inversée le ${point.day}`).toBeGreaterThanOrEqual(point.expected - 0.01);
    }
    // Les échéances tombent dans le mois en cours, jamais avant aujourd'hui.
    for (const flow of forecast.upcoming) {
      expect(flow.date > scenario.today.toISOString().slice(0, 10)).toBe(true);
      expect(flow.date.slice(0, 7)).toBe(scenario.today.toISOString().slice(0, 7));
      finite(flow.amount, `échéance ${flow.merchantName}`);
    }
  });

  it("ne détecte comme récurrent que ce qui l’est", () => {
    const recurring = detectSubscriptions(flows, scenario.today);
    for (const item of recurring) {
      finite(item.latestAmount, `abonnement ${item.merchantName}`);
      expect(item.latestAmount).toBeGreaterThan(0);
      expect(["weekly", "monthly", "yearly"]).toContain(item.frequency);
    }
    // Un encaissement ne peut pas figurer parmi les prélèvements, et réciproquement.
    const income = detectRecurringIncome(flows, scenario.today).map((item) => item.merchantName);
    expect(recurring.map((item) => item.merchantName).filter((name) => income.includes(name))).toEqual([]);
  });
});

describe("couverture des scénarios", () => {
  it("éprouve bien les cas limites annoncés", () => {
    const built = SCENARIOS.map(buildSummary);
    // Un mois sans aucune dépense.
    expect(built.some((summary) => summary.totalSpent === 0)).toBe(true);
    // Un compte dans le rouge.
    expect(SCENARIOS.some((scenario) => scenario.accounts.some((account) => (account.balance ?? 0) < 0))).toBe(true);
    // Aucun mois de comparaison.
    expect(built.some((summary) => summary.typicalMonth === null)).toBe(true);
    // Plusieurs devises, plusieurs comptes.
    expect(SCENARIOS.some((scenario) => new Set(scenario.accounts.map((account) => account.currency)).size > 1)).toBe(true);
    expect(SCENARIOS.some((scenario) => scenario.accounts.length >= 4)).toBe(true);
    // Un libellé qu'aucune colonne ne peut contenir.
    expect(built.some((summary) => summary.latest.some((row) => row.merchantName.length > 60))).toBe(true);
    // Un budget largement dépassé.
    expect(built.some((summary) => summary.budgetStatus.some((row) => (row.percentageUsed ?? 0) > 150))).toBe(true);
  });
});
