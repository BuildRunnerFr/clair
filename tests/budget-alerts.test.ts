import { describe, expect, it } from "vitest";
import { budgetAlerts } from "@/lib/analytics/budget-alerts";
import type { BudgetStatus } from "@/types/database";

const status = (over: Partial<BudgetStatus> = {}): BudgetStatus => ({
  budgetId: "b1", category: "Restaurants", currency: "EUR",
  monthlyLimit: 300, spent: 100, remaining: 200, percentageUsed: 33, ...over
});

describe("alertes de budget", () => {
  it("signale un budget dépassé, avec le montant du dépassement", () => {
    expect(budgetAlerts([status({ spent: 340 })])).toEqual([
      { category: "Restaurants", monthlyLimit: 300, spent: 340, overrun: 40 }
    ]);
  });

  it("se tait tant que la limite tient", () => {
    expect(budgetAlerts([status({ spent: 299.99 })])).toEqual([]);
    expect(budgetAlerts([status({ spent: 300 })])).toEqual([]);
  });

  it("ignore les catégories sans budget défini", () => {
    expect(budgetAlerts([status({ monthlyLimit: null, spent: 900 })])).toEqual([]);
  });

  it("classe le plus gros dépassement en tête", () => {
    const alerts = budgetAlerts([
      status({ category: "Petit", spent: 310 }),
      status({ category: "Gros", spent: 500 }),
      status({ category: "Moyen", spent: 380 })
    ]);
    expect(alerts.map((alert) => alert.category)).toEqual(["Gros", "Moyen", "Petit"]);
  });

  it("arrondit le dépassement, sans quoi la soustraction laisse fuir du bruit flottant", () => {
    // 300.1 - 300 vaut 0.09999999999997726 en virgule flottante, affiché tel quel sans arrondi.
    expect(budgetAlerts([status({ spent: 300.1 })])[0]!.overrun).toBe(0.1);
  });
});
