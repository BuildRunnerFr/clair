import { describe, expect, it } from "vitest";
import { forecastCashflow, type DailySpend } from "@/lib/analytics/cashflow";
import type { StoredSubscription } from "@/lib/subscriptions/detect";

const flow = (over: Partial<StoredSubscription> = {}): StoredSubscription =>
  ({ merchantName: "X", latestAmount: 100, previousAmount: null, averageAmount: 100, currency: "EUR", frequency: "monthly", lastTransactionDate: "2026-10-10", ...over });

/** Douze mois de dépenses élevées : de quoi projeter une chute si rien ne rentre. */
const daily: DailySpend[] = Array.from({ length: 12 }, (_, index) => ({
  month: `2026-${String(index + 1).padStart(2, "0")}`, day: 20, total: 1800
}));

// Un prélèvement récurrent : sans lui il n'y aurait rien du tout à annoncer, et la prévision
// entière serait nulle. Ce qu'on vérifie ici, c'est qu'il subsiste quand la courbe disparaît.
const base = { today: new Date("2026-11-05T12:00:00Z"), daily, currency: "EUR", subscriptions: [flow({ merchantName: "LOYER", latestAmount: 700 })], incomes: [] as StoredSubscription[] };

describe("garde-fou de la prévision de solde", () => {
  it("renonce à la courbe quand rien n’est attendu en entrée et que le solde n’y suffit pas", () => {
    // Constaté en usage : 301 € au compte, une prévision à −4 700 €, et la courbe mesurée
    // écrasée par une bande quinze fois plus large que le solde. Sans revenu connu, le calcul
    // ne peut décrire qu'un appauvrissement — ce n'est pas une prévision.
    const forecast = forecastCashflow({ ...base, startBalance: 301.67 });
    expect(forecast).not.toBeNull();
    expect(forecast!.points).toEqual([]);
    expect(forecast!.endBalance).toBeNull();
    // Les échéances datées, elles, restent : elles sont exactes.
    expect(forecast!.committed).toBe(700);
    expect(forecast!.upcoming).toHaveLength(1);
  });

  it("trace la courbe dès qu’un encaissement régulier est connu", () => {
    const withSalary = forecastCashflow({ ...base, startBalance: 301.67, incomes: [flow({ merchantName: "SALAIRE", latestAmount: 2400, lastTransactionDate: "2026-10-28" })] });
    expect(withSalary!.points.length).toBeGreaterThan(0);
    expect(withSalary!.expectedIncome).toBe(2400);
  });

  it("trace la courbe sans revenu si le solde absorbe la dépense attendue", () => {
    // Le garde-fou vise l'incomplétude du modèle, pas l'absence de salaire : un solde qui couvre
    // la dépense habituelle donne une prévision qui a du sens.
    const comfortable = forecastCashflow({ ...base, startBalance: 12000 });
    expect(comfortable!.points.length).toBeGreaterThan(0);
  });
});
