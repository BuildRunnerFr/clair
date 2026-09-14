import { describe, expect, it } from "vitest";
import { formatAmountCompact, formatMoney, formatMoneyRange, moneyFormatter, normalizeCurrency, selectCurrency } from "@/lib/currency";

describe("dynamic currencies", () => {
  it("detects GBP and any valid unknown ISO-shaped currency", () => {
    expect(normalizeCurrency("gbp")).toBe("GBP");
    expect(normalizeCurrency("sgd")).toBe("SGD");
    expect(normalizeCurrency("USDT")).toBeNull();
  });

  it("selects query, then saved preference, then the most relevant ordered currency", () => {
    expect(selectCurrency(["GBP", "EUR", "MYR"], "EUR", "MYR")).toBe("EUR");
    expect(selectCurrency(["GBP", "EUR", "MYR"], undefined, "MYR")).toBe("MYR");
    expect(selectCurrency(["GBP", "EUR"], undefined, "MYR")).toBe("GBP");
  });

  it("delegates symbols and fraction digits to Intl.NumberFormat", () => {
    expect(formatMoney(12.5, "GBP", "en-GB")).toContain("£");
    expect(formatMoney(12.5, "EUR", "fr-FR")).toContain("€");
    expect(formatMoney(12.5, "MYR", "ms-MY")).toContain("RM");
    expect(formatMoney(1234, "JPY", "ja-JP")).toBe("￥1,234");
  });
});

describe("formats compacts", () => {
  it("réunit une étendue sous un seul symbole", () => {
    expect(formatMoneyRange(605, 1326, "EUR").replace(/ | /g, " ")).toBe("605–1 326 €");
  });

  it("arrondit l’étendue, les centimes n’aidant pas à situer un ordre de grandeur", () => {
    expect(formatMoneyRange(604.7, 1326.4, "EUR")).toMatch(/605/);
    expect(formatMoneyRange(604.7, 1326.4, "EUR")).not.toMatch(/,7/);
  });

  it("refuse une devise invalide plutôt que de produire un montant faux", () => {
    expect(() => formatMoneyRange(1, 2, "XX")).toThrow(RangeError);
  });

  it("formate un montant nu, sans symbole à retirer ensuite", () => {
    // Le graphique de tendance retirait « € » par expression régulière : en dollars, le symbole
    // restait. Un format sans symbole supprime le problème au lieu de le déplacer.
    expect(formatAmountCompact(1326.4).replace(/ | /g, " ")).toBe("1 326");
  });
});

describe("formats liés à une langue", () => {
  it("applique la langue aux trois formats", () => {
    const fr = moneyFormatter("fr-FR");
    const en = moneyFormatter("en-GB");
    // Le séparateur décimal et la place du symbole changent : « 1 234,56 € » contre « €1,234.56 ».
    expect(fr.money(1234.56, "EUR")).not.toBe(en.money(1234.56, "EUR"));
    expect(en.money(1234.56, "EUR")).toContain("1,234.56");
    expect(fr.money(1234.56, "EUR")).toMatch(/1.234,56/);
  });

  it("lie aussi l’étendue et le montant nu", () => {
    const en = moneyFormatter("en-GB");
    expect(en.range(605, 1326, "EUR")).toContain("1,326");
    expect(en.amount(1326.4)).toBe("1,326");
  });
});

describe("montants de titre", () => {
  const { headline, money } = moneyFormatter("fr-FR");

  it("garde les centimes sur les montants courants", () => {
    expect(headline(1487.62, "EUR")).toBe(money(1487.62, "EUR"));
    expect(headline(9999.99, "EUR")).toContain("99");
  });

  it("les laisse tomber au-delà de dix mille", () => {
    // « 103 484,99 € » demandait cent vingt pixels dans une tuile qui en offre quatre-vingt-dix-
    // sept : le symbole se faisait couper, et un montant amputé de son unité est pire qu'un
    // montant arrondi.
    expect(headline(103484.99, "EUR")).not.toContain(",99");
    expect(headline(103484.99, "EUR")).toMatch(/103\s?485/);
    expect(headline(103484.99, "EUR")).toContain("€");
  });

  it("arrondit aussi les montants négatifs", () => {
    expect(headline(-24350.4, "EUR")).not.toContain(",40");
    expect(headline(-24350.4, "EUR")).toContain("€");
  });
});
