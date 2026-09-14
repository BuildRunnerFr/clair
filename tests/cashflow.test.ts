import { describe, expect, it } from "vitest";
import { discretionaryOutlook, expectedOccurrences, forecastCashflow, type DailySpend } from "@/lib/analytics/cashflow";
import type { StoredSubscription } from "@/lib/subscriptions/detect";
import { detectRecurringIncome, detectSubscriptions } from "@/lib/subscriptions/detect";

function flow(overrides: Partial<StoredSubscription> = {}): StoredSubscription {
  return { merchantName: "LOYER", latestAmount: 700, previousAmount: null, averageAmount: 700, currency: "EUR", frequency: "monthly", lastTransactionDate: "2026-08-05", ...overrides };
}

describe("expectedOccurrences", () => {
  it("projette un prélèvement mensuel au même jour du mois", () => {
    const dates = expectedOccurrences(flow(), new Date("2026-09-01"), new Date("2026-11-30")).map((item) => item.date);
    expect(dates).toEqual(["2026-09-05", "2026-10-05", "2026-11-05"]);
  });

  it("ramène le 31 au dernier jour des mois plus courts, sans y rester", () => {
    // Le pas de 30,4 jours dériverait ; le calcul depuis l'ancre rend son jour au mois suivant.
    const dates = expectedOccurrences(flow({ lastTransactionDate: "2026-01-31" }), new Date("2026-02-01"), new Date("2026-04-30")).map((item) => item.date);
    expect(dates).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("respecte la cadence hebdomadaire et annuelle", () => {
    expect(expectedOccurrences(flow({ frequency: "weekly" }), new Date("2026-08-06"), new Date("2026-08-26")).map((item) => item.date))
      .toEqual(["2026-08-12", "2026-08-19", "2026-08-26"]);
    expect(expectedOccurrences(flow({ frequency: "yearly" }), new Date("2026-08-06"), new Date("2027-12-31")).map((item) => item.date))
      .toEqual(["2027-08-05"]);
  });

  it("n'invente rien hors de la fenêtre", () => {
    expect(expectedOccurrences(flow(), new Date("2026-09-06"), new Date("2026-09-30"))).toEqual([]);
  });
});

describe("discretionaryOutlook", () => {
  const rows: DailySpend[] = [
    { month: "2026-06", day: 3, total: 200 }, { month: "2026-06", day: 20, total: 300 },
    { month: "2026-07", day: 10, total: 150 }, { month: "2026-07", day: 25, total: 450 },
    { month: "2026-08", day: 28, total: 100 },
    { month: "2026-09", day: 2, total: 999 }
  ];

  it("ne retient que ce qui suit le jour de coupe, mois en cours exclu", () => {
    // Juin 300, juillet 150 + 450 = 600, août 100 → médiane 300, étendue 100–600.
    expect(discretionaryOutlook(rows, "2026-09", 5)).toEqual({ typical: 300, low: 100, high: 600, monthsObserved: 3 });
  });

  it("renvoie zéro mois observé quand aucun passé ne couvre la période", () => {
    expect(discretionaryOutlook(rows, "2026-09", 29).monthsObserved).toBe(0);
  });
});

describe("forecastCashflow", () => {
  // Neuf mois au moins, sinon la bande ne couvre pas assez pour être tracée. Les totaux vont de
  // 300 à 900 pour que l'étendue soit lisible dans les attentes.
  const totals = [600, 900, 300, 600, 600, 600, 600, 600, 600, 600];
  const daily: DailySpend[] = totals.map((total, index) => ({ month: `2025-${String(index + 11 - 10).padStart(2, "0")}`, day: 20, total }))
    .map((row, index) => ({ ...row, month: `2026-${String(index + 1).padStart(2, "0")}` }));
  const base = {
    startBalance: 2000,
    today: new Date("2026-11-05T12:00:00Z"),
    subscriptions: [flow({ merchantName: "LOYER", latestAmount: 700, lastTransactionDate: "2026-10-10" })],
    incomes: [flow({ merchantName: "SALAIRE", latestAmount: 2400, lastTransactionDate: "2026-10-28" })],
    daily,
    currency: "EUR"
  };

  it("part du solde mesuré et arrive au solde attendu", () => {
    const forecast = forecastCashflow(base)!;
    expect(forecast.startBalance).toBe(2000);
    expect(forecast.points).toHaveLength(25); // du 6 au 30 novembre
    expect(forecast.committed).toBe(700);
    expect(forecast.expectedIncome).toBe(2400);
    // 2000 − 700 + 2400 − 600 (médiane des dépenses du quotidien) = 3100.
    expect(forecast.endBalance).toBe(3100);
    expect(forecast.available).toBe(1300);
  });

  it("date les décrochements sur les prélèvements plutôt que de lisser", () => {
    const forecast = forecastCashflow(base)!;
    const before = forecast.points.find((point) => point.day === "2026-11-09")!;
    const after = forecast.points.find((point) => point.day === "2026-11-10")!;
    expect(before.expected - after.expected).toBeCloseTo(724, 0); // 700 de loyer + un jour de quotidien
  });

  it("élargit la bande à mesure qu'on s'éloigne", () => {
    const forecast = forecastCashflow(base)!;
    const first = forecast.points[0]!;
    const last = forecast.points[forecast.points.length - 1]!;
    expect(last.high - last.low).toBeGreaterThan(first.high - first.low);
    expect(last.high - last.low).toBeCloseTo(600, 0); // étendue observée 300–900
  });

  it("annonce la couverture attendue de la bande", () => {
    // Dix mois de comparaison : (10 − 1) / (10 + 1).
    expect(forecastCashflow(base)!.coverage).toBeCloseTo(9 / 11, 5);
  });

  it("renonce à la courbe sous neuf mois d'historique, sans renoncer aux engagements", () => {
    // Mesuré : à deux mois de comparaison la bande ne contient la réalité qu'une fois sur trois.
    const forecast = forecastCashflow({ ...base, daily: daily.slice(0, 3) })!;
    expect(forecast.points).toEqual([]);
    expect(forecast.endBalance).toBeNull();
    expect(forecast.committed).toBe(700);
    expect(forecast.available).toBe(1300);
  });

  it("ne renvoie rien quand il n'y a ni courbe ni engagement", () => {
    expect(forecastCashflow({ ...base, daily: [], subscriptions: [], incomes: [] })).toBeNull();
  });

  it("ne projette rien le dernier jour du mois", () => {
    expect(forecastCashflow({ ...base, today: new Date("2026-11-30T12:00:00Z") })).toBeNull();
  });

  it("ignore les flux d'une autre devise que celle des soldes", () => {
    const forecast = forecastCashflow({ ...base, subscriptions: [flow({ currency: "GBP", lastTransactionDate: "2026-10-10" })], incomes: [] })!;
    expect(forecast.committed).toBe(0);
  });
});

describe("detectRecurringIncome", () => {
  const salary = [0, 1, 2].map((month) => ({ merchantName: "SALAIRE", amount: 2400, currency: "EUR", transactionDate: `2026-0${7 + month}-28T00:00:00.000Z` }));
  const rent = [0, 1, 2].map((month) => ({ merchantName: "LOYER", amount: -700, currency: "EUR", transactionDate: `2026-0${7 + month}-05T00:00:00.000Z` }));

  it("reconnaît un salaire régulier, que la détection d'abonnements ignore", () => {
    const today = new Date("2026-09-30");
    expect(detectRecurringIncome([...salary, ...rent], today).map((item) => item.merchantName)).toEqual(["SALAIRE"]);
    expect(detectSubscriptions([...salary, ...rent], today).map((item) => item.merchantName)).toEqual(["LOYER"]);
  });
});
