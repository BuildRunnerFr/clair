import { describe, expect, it } from "vitest";
import { detectSubscriptions, yearlyCost, type RecurringInput } from "@/lib/subscriptions/detect";

const TODAY = new Date("2026-09-03T00:00:00Z");
const monthly = (merchant: string, amount: number, months: string[], currency = "EUR"): RecurringInput[] =>
  months.map((date) => ({ merchantName: merchant, amount: -amount, currency, transactionDate: `${date}T10:00:00.000Z` }));

describe("détection d’abonnements", () => {
  it("repère un prélèvement mensuel de montant stable", () => {
    const found = detectSubscriptions(monthly("NETFLIX", 13.49, ["2026-06-05", "2026-07-05", "2026-08-05", "2026-09-02"]), TODAY);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ merchantName: "NETFLIX", frequency: "monthly", occurrences: 4 });
  });

  it("tolère une variation de montant, comme une facture d’énergie", () => {
    const bills = [
      { merchantName: "EDF", amount: -82, currency: "EUR", transactionDate: "2026-06-10T00:00:00Z" },
      { merchantName: "EDF", amount: -90, currency: "EUR", transactionDate: "2026-07-10T00:00:00Z" },
      { merchantName: "EDF", amount: -86, currency: "EUR", transactionDate: "2026-08-10T00:00:00Z" }
    ];
    expect(detectSubscriptions(bills, TODAY)).toHaveLength(1);
  });

  it("ne confond pas des courses régulières avec un abonnement", () => {
    // Régulier dans le temps mais de montant très variable : c'est le cas que la seule
    // régularité ferait passer pour un prélèvement.
    const groceries = ["2026-07-05", "2026-08-04", "2026-09-01"].map((date, index) => ({
      merchantName: "CARREFOUR", amount: -[23.4, 78.9, 41.2][index]!, currency: "EUR", transactionDate: `${date}T00:00:00Z`
    }));
    expect(detectSubscriptions(groceries, TODAY)).toEqual([]);
  });

  it("ne retient pas deux achats identiques espacés au hasard", () => {
    // Montant stable mais cadence absente : l'autre moitié du piège.
    const coffees = ["2026-06-02", "2026-07-19", "2026-08-30"].map((date) => ({
      merchantName: "STARBUCKS", amount: -4.5, currency: "EUR", transactionDate: `${date}T00:00:00Z`
    }));
    expect(detectSubscriptions(coffees, TODAY)).toEqual([]);
  });

  it("accepte deux occurrences si la preuve est nette", () => {
    // Au centime et au jour près : trois abonnements réels étaient manqués sans cela.
    const found = detectSubscriptions(monthly("SERVICE EN LIGNE", 21.6, ["2026-08-13", "2026-09-13"]), new Date("2026-09-14T00:00:00Z"));
    expect(found).toHaveLength(1);
  });

  it("refuse deux occurrences dès que la preuve s’affaiblit", () => {
    // Écart de montant de 10 % : toléré à trois occurrences, refusé à deux.
    const wobbly = [
      { merchantName: "PEUT-ÊTRE", amount: -20, currency: "EUR", transactionDate: "2026-08-01T00:00:00Z" },
      { merchantName: "PEUT-ÊTRE", amount: -22, currency: "EUR", transactionDate: "2026-09-01T00:00:00Z" }
    ];
    expect(detectSubscriptions(wobbly, TODAY)).toEqual([]);
  });

  it("refuse deux occurrences dont l’intervalle est approximatif", () => {
    // 25 jours : dans la tolérance ordinaire, hors de la tolérance resserrée.
    expect(detectSubscriptions(monthly("APPROXIMATIF", 9.99, ["2026-08-09", "2026-09-03"]), TODAY)).toEqual([]);
  });

  it("écarte un abonnement dès qu’un prélèvement attendu manque", () => {
    // Constaté en usage réel : trois abonnements résiliés en juillet figuraient encore comme
    // actifs début septembre. Le prélèvement d'août n'ayant pas eu lieu, ils sont arrêtés.
    expect(detectSubscriptions(monthly("RÉSILIÉ", 6.32, ["2026-06-18", "2026-07-18"]), TODAY)).toEqual([]);
    expect(detectSubscriptions(monthly("ANCIEN SERVICE", 9.99, ["2026-01-05", "2026-02-05", "2026-03-05"]), TODAY)).toEqual([]);
  });

  it("retient un abonnement dont le prélèvement du mois est déjà passé", () => {
    expect(detectSubscriptions(monthly("ACTIF", 12, ["2026-06-28", "2026-07-28", "2026-08-28"]), TODAY)).toHaveLength(1);
  });

  it("expose le dernier montant et signale un changement de prix", () => {
    // Le loyer est passé de 600 à 615 € : la moyenne affichait 605 €, un montant jamais
    // prélevé et qui ne le sera jamais.
    const rent = [
      { merchantName: "LOYER RESIDENCE", amount: -600, currency: "EUR", transactionDate: "2026-06-24T00:00:00Z" },
      { merchantName: "LOYER RESIDENCE", amount: -600, currency: "EUR", transactionDate: "2026-07-24T00:00:00Z" },
      { merchantName: "LOYER RESIDENCE", amount: -615, currency: "EUR", transactionDate: "2026-08-28T00:00:00Z" }
    ];
    const [found] = detectSubscriptions(rent, TODAY);
    expect(found).toMatchObject({ latestAmount: 615, previousAmount: 600 });
    expect(yearlyCost(found!)).toBe(7380);
  });

  it("ne signale aucun changement quand le montant est constant", () => {
    const [found] = detectSubscriptions(monthly("STABLE", 9.99, ["2026-07-05", "2026-08-05", "2026-09-01"]), TODAY);
    expect(found!.previousAmount).toBeNull();
  });

  it("rejette une série dont les écarts se compensent", () => {
    // Médiane correcte mais intervalles de 10 et 50 jours : irrégulier, donc écarté.
    const uneven = [
      { merchantName: "X", amount: -20, currency: "EUR", transactionDate: "2026-07-01T00:00:00Z" },
      { merchantName: "X", amount: -20, currency: "EUR", transactionDate: "2026-07-11T00:00:00Z" },
      { merchantName: "X", amount: -20, currency: "EUR", transactionDate: "2026-08-30T00:00:00Z" }
    ];
    expect(detectSubscriptions(uneven, TODAY)).toEqual([]);
  });

  it("ignore les encaissements", () => {
    const salary = ["2026-06-30", "2026-07-31", "2026-08-31"].map((date) => ({
      merchantName: "SALAIRE", amount: 2500, currency: "EUR", transactionDate: `${date}T00:00:00Z`
    }));
    expect(detectSubscriptions(salary, TODAY)).toEqual([]);
  });

  it("ne mélange pas deux devises pour un même commerçant", () => {
    const mixed = [
      ...monthly("WISE", 5, ["2026-06-01", "2026-07-01", "2026-08-01"], "EUR"),
      ...monthly("WISE", 5, ["2026-06-15", "2026-07-15", "2026-08-15"], "GBP")
    ];
    expect(detectSubscriptions(mixed, TODAY)).toHaveLength(2);
  });

  it("annualise pour rendre les abonnements comparables entre eux", () => {
    // Un abonnement mensuel à 10 € coûte plus qu'un annuel à 100 € : le coût annualisé est la
    // seule grandeur qui permet de les classer.
    const [netflix] = detectSubscriptions(monthly("NETFLIX", 10, ["2026-06-05", "2026-07-05", "2026-08-05", "2026-09-02"]), TODAY);
    expect(yearlyCost(netflix!)).toBe(120);
  });
});
