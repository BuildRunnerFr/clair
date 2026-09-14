import { describe, expect, it, vi } from "vitest";
import { convertToBase, type FxRateStore } from "@/lib/fx/fx-converter";
import type { FxProvider, FxRate } from "@/lib/fx/fx-provider";

const store = (cached: FxRate[] = []): FxRateStore & { saved: FxRate[] } => {
  const saved: FxRate[] = [];
  return {
    saved,
    async findRates(base, requests) {
      const wanted = new Set(requests.map((item) => `${item.quoteCurrency} ${item.rateDate}`));
      return cached.filter((rate) => rate.baseCurrency === base && wanted.has(`${rate.quoteCurrency} ${rate.rateDate}`));
    },
    async saveRates(rates) { saved.push(...rates); }
  };
};

const provider = (rate: number, publishedOn?: string): FxProvider => ({
  name: "test",
  getRate: vi.fn(async (from, to, date) => ({ rateDate: publishedOn ?? date, baseCurrency: from, quoteCurrency: to, rate }))
});

describe("conversion vers la devise principale", () => {
  it("convertit au taux du jour de la transaction et arrondit au centime", async () => {
    const [result] = await convertToBase([{ amount: -10, currency: "GBP", date: "2026-08-20T12:00:00.000Z" }], "EUR", provider(1.1834), store());
    expect(result).toMatchObject({ amountBase: -11.83, baseCurrency: "EUR", fxRate: 1.1834, fxRateDate: "2026-08-20" });
  });

  it("laisse intact un montant déjà dans la devise principale, sans appeler le fournisseur", async () => {
    const fx = provider(999);
    const [result] = await convertToBase([{ amount: -42.5, currency: "EUR", date: "2026-08-20" }], "EUR", fx, store());
    expect(result).toMatchObject({ amountBase: -42.5, fxRate: 1 });
    expect(fx.getRate).not.toHaveBeenCalled();
  });

  it("ne demande qu’un taux par couple (devise, jour) même pour de nombreuses transactions", async () => {
    const fx = provider(1.2);
    const requests = Array.from({ length: 50 }, (_, index) => ({ amount: -index, currency: "GBP", date: "2026-08-20" }));
    await convertToBase(requests, "EUR", fx, store());
    expect(fx.getRate).toHaveBeenCalledTimes(1);
  });

  it("réutilise le cache sans appeler le fournisseur", async () => {
    const fx = provider(1.2);
    const cache = store([{ rateDate: "2026-08-20", baseCurrency: "EUR", quoteCurrency: "GBP", rate: 1.15 }]);
    const [result] = await convertToBase([{ amount: -10, currency: "GBP", date: "2026-08-20" }], "EUR", fx, cache);
    expect(result.amountBase).toBe(-11.5);
    expect(fx.getRate).not.toHaveBeenCalled();
    expect(cache.saved).toHaveLength(0);
  });

  it("conserve la date de publication réelle quand le jour demandé est férié ou un week-end", async () => {
    const cache = store();
    // Dimanche demandé, la BCE n’ayant rien publié le taux du vendredi s’applique.
    const [result] = await convertToBase([{ amount: -20, currency: "GBP", date: "2026-08-23" }], "EUR", provider(1.18, "2026-08-21"), cache);
    expect(result.fxRateDate).toBe("2026-08-21");
    expect(cache.saved[0]!.rateDate).toBe("2026-08-21");
  });

  it("n’échoue pas quand le taux est indisponible et explique pourquoi", async () => {
    const failing: FxProvider = { name: "test", getRate: async () => { throw new Error("Taux de change indisponible (503)."); } };
    const [result] = await convertToBase([{ amount: -10, currency: "GBP", date: "2026-08-20" }], "EUR", failing, store());
    expect(result).toMatchObject({ amountBase: null, fxRate: null, fxRateDate: null });
    expect(result.error).toContain("503");
  });

  it("convertit chaque devise avec son propre taux dans un même lot", async () => {
    const fx: FxProvider = { name: "test", getRate: async (from) => ({ rateDate: "2026-08-20", baseCurrency: from, quoteCurrency: "EUR", rate: from === "GBP" ? 1.18 : 0.2 }) };
    const results = await convertToBase([
      { amount: -10, currency: "GBP", date: "2026-08-20" },
      { amount: -100, currency: "MYR", date: "2026-08-20" }
    ], "EUR", fx, store());
    expect(results[0]!.amountBase).toBe(-11.8);
    expect(results[1]!.amountBase).toBe(-20);
  });
});

describe("cohérence du cache de taux", () => {
  it("réenregistre les taux dans l’orientation que la relecture interroge", async () => {
    // Le fournisseur répond dans son sens (base=GBP, quote=EUR) ; le cache indexe par la
    // devise principale. Sans normalisation, la ligne écrite ne serait jamais retrouvée et
    // chaque conversion rappellerait l’API indéfiniment.
    const cache = store();
    const fx: FxProvider = { name: "test", getRate: async (from, to, date) => ({ rateDate: date, baseCurrency: from, quoteCurrency: to, rate: 1.1665 }) };
    await convertToBase([{ amount: -10, currency: "GBP", date: "2026-08-20" }], "EUR", fx, cache);

    expect(cache.saved[0]).toMatchObject({ baseCurrency: "EUR", quoteCurrency: "GBP", rate: 1.1665 });

    // Relecture : ce qui vient d’être écrit doit suffire, sans nouvel appel réseau.
    const second = store(cache.saved);
    const spy: FxProvider = { name: "test", getRate: vi.fn(async () => { throw new Error("ne doit pas être appelé"); }) };
    const [result] = await convertToBase([{ amount: -10, currency: "GBP", date: "2026-08-20" }], "EUR", spy, second);
    expect(result.amountBase).toBe(-11.67);
    expect(spy.getRate).not.toHaveBeenCalled();
  });
});

describe("arrondi monétaire", () => {
  it("arrondit à l’écart de zéro, symétriquement pour un débit et un crédit", async () => {
    const fx = provider(1.1665);
    const [debit, credit] = await convertToBase([
      { amount: -10, currency: "GBP", date: "2026-08-20" },
      { amount: 10, currency: "GBP", date: "2026-08-20" }
    ], "EUR", fx, store());
    // -11.665 et +11.665 doivent s'arrondir au même centime en valeur absolue.
    expect(debit!.amountBase).toBe(-11.67);
    expect(credit!.amountBase).toBe(11.67);
  });
});
