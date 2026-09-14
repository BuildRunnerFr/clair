import { describe, it } from "vitest";
import { SCENARIOS } from "./fixtures/scenarios";
import { buildAccounts, buildSummary } from "./fixtures/build-summary";
import { forecastCashflow } from "@/lib/analytics/cashflow";
import { detectRecurringIncome, detectSubscriptions } from "@/lib/subscriptions/detect";
import { budgetAlerts } from "@/lib/analytics/budget-alerts";

/** Un état des lieux, pour vérifier que les épreuves portent sur quelque chose. */
describe("état des scénarios", () => {
  it("récapitule ce que chacun produit", () => {
    const rows = SCENARIOS.map((scenario) => {
      const summary = buildSummary(scenario);
      const accounts = buildAccounts(scenario);
      const flows = scenario.movements.map((item) => ({
        merchantName: item.merchant, amount: item.amount,
        currency: item.currency ?? summary.baseCurrency, transactionDate: `${item.date}T10:00:00.000Z`
      }));
      const balance = accounts.filter((a) => a.currency === summary.baseCurrency).reduce((t, a) => t + (a.balanceCurrent ?? 0), 0);
      const subs = detectSubscriptions(flows, scenario.today);
      const incomes = detectRecurringIncome(flows, scenario.today);
      const forecast = forecastCashflow({ startBalance: balance, today: scenario.today, subscriptions: subs, incomes, daily: summary.dailyDiscretionary, currency: summary.baseCurrency });
      return {
        scénario: scenario.name,
        dépensé: summary.totalSpent,
        revenus: summary.income,
        catég: summary.byCategory.length,
        moisType: summary.typicalMonth ? `${summary.typicalMonth.changePercent}%` : "—",
        abos: subs.length,
        salaires: incomes.length,
        prévision: forecast ? (forecast.points.length ? `${forecast.points.length} pts` : "échéances seules") : "aucune",
        alertes: budgetAlerts(summary.budgetStatus).length,
        opérations: summary.latest.length
      };
    });
    console.table(rows);
  });
});
