import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { FinanceTools } from "@/lib/ai/assistant/finance-tools";

/**
 * Ce que l'outil « où ai-je trop dépensé » doit rendre, et dans quel ordre.
 *
 * Le point délicat n'est pas le calcul, c'est ce qu'il refuse de faire : il ne décide pas
 * qu'une dépense est superflue. La famille le dit — elle vient du produit, pas du modèle — et
 * une catégorie sans historique n'est comparée à rien plutôt que comparée à zéro.
 */
const client = (parCategorie: Array<{ category: string; total_spent: number }>,
                historique: Array<{ category: string; average_monthly: number; months_counted: number }>) => ({
  rpc: vi.fn(async (nom: string) => {
    if (nom === "finance_base_currency") return { data: "EUR", error: null };
    if (nom === "finance_spending_by_category") return { data: parCategorie, error: null };
    if (nom === "finance_category_history") return { data: historique, error: null };
    return { data: [], error: null };
  })
}) as never;

const outil = (c: never) => new FinanceTools(c);

describe("l’écart à l’habitude, par catégorie", () => {
  it("classe les postes du plus grand dépassement au plus petit", async () => {
    const resultat = await outil(client(
      [{ category: "Restaurants", total_spent: 400 }, { category: "Housing", total_spent: 800 }, { category: "Groceries", total_spent: 300 }],
      [{ category: "Restaurants", average_monthly: 200, months_counted: 6 },
       { category: "Housing", average_monthly: 800, months_counted: 6 },
       { category: "Groceries", average_monthly: 350, months_counted: 6 }]
    )).run("get_unusual_spending", { month: "2020-01" }) as { categories: Array<{ category: string; difference: number | null; differencePercent: number | null }> };

    expect(resultat.categories.map((c) => c.category)).toEqual(["Restaurants", "Housing", "Groceries"]);
    expect(resultat.categories[0]!.difference).toBe(200);
    expect(resultat.categories[0]!.differencePercent).toBe(100);
    // Un poste conforme à son habitude n'est pas un dépassement : l'écart est nul, pas absent.
    expect(resultat.categories[1]!.difference).toBe(0);
    expect(resultat.categories[2]!.difference).toBe(-50);
  });

  it("désigne le discrétionnaire par la famille, sans en juger lui-même", async () => {
    const resultat = await outil(client(
      [{ category: "Restaurants", total_spent: 400 }, { category: "Housing", total_spent: 800 }],
      [{ category: "Restaurants", average_monthly: 200, months_counted: 6 }, { category: "Housing", average_monthly: 800, months_counted: 6 }]
    )).run("get_unusual_spending", { month: "2020-01" }) as { categories: Array<{ category: string; family: string; discretionary: boolean }> };

    const restaurants = resultat.categories.find((c) => c.category === "Restaurants")!;
    const logement = resultat.categories.find((c) => c.category === "Housing")!;
    expect(restaurants.discretionary).toBe(true);
    expect(restaurants.family).toBe("Plaisirs");
    expect(logement.discretionary).toBe(false);
    expect(logement.family).toBe("Essentiels");
  });

  it("ne compare pas une catégorie sans habitude", async () => {
    const resultat = await outil(client(
      [{ category: "Travel", total_spent: 900 }],
      []
    )).run("get_unusual_spending", { month: "2020-01" }) as { categories: Array<{ usualMonthly: number | null; monthsCounted: number; difference: number | null }> };

    expect(resultat.categories[0]!.usualMonthly).toBeNull();
    expect(resultat.categories[0]!.difference).toBeNull();
    expect(resultat.categories[0]!.monthsCounted).toBe(0);
  });

  it("avertit quand le mois n’est pas terminé, et se tait quand il l’est", async () => {
    const enCours = new Date().toISOString().slice(0, 7);
    const vide = client([], []);
    const courant = await outil(vide).run("get_unusual_spending", { month: enCours }) as { monthComplete: boolean; avertissement?: string };
    const passe = await outil(vide).run("get_unusual_spending", { month: "2020-01" }) as { monthComplete: boolean; avertissement?: string };
    expect(courant.monthComplete).toBe(false);
    expect(courant.avertissement).toMatch(/pas terminé/);
    expect(passe.monthComplete).toBe(true);
    expect(passe.avertissement).toBeUndefined();
  });
});

/**
 * Ce que le bloc d'opérations montre, et dans quelle unité.
 *
 * Deux défauts constatés en posant la question sur de vraies données : la réponse annonçait des
 * totaux en livres pendant que les lignes s'affichaient en euros — l'application ayant deux
 * notions de devise de base qui peuvent différer — et un même prélèvement passé sur cinq
 * comptes remplissait le bloc de cinq lignes indiscernables.
 */
const clientTransactions = (rows: Array<Record<string, unknown>>) => ({
  rpc: vi.fn(async () => ({ data: "EUR", error: null })),
  from: vi.fn(() => {
    const chaine: Record<string, unknown> = {};
    for (const methode of ["select", "gte", "lt", "eq", "order"]) chaine[methode] = vi.fn(() => chaine);
    chaine.limit = vi.fn(async () => ({ data: rows, error: null }));
    return chaine;
  })
}) as never;

describe("les bornes du bloc d’opérations", () => {
  /**
   * « Quelle est ma plus grosse dépense depuis la création du compte ? » n'avait pas de réponse :
   * l'outil exigeait un mois. L'assistant le disait honnêtement, ce qui ne le rendait pas moins
   * inutile — c'est la question la plus naturelle qu'on puisse poser.
   */
  const filtres = (rows: Array<Record<string, unknown>> = []) => {
    const appels: Array<[string, unknown]> = [];
    const chaine: Record<string, unknown> = {};
    for (const methode of ["select", "gte", "lt", "eq", "order"]) {
      chaine[methode] = vi.fn((...args: unknown[]) => { appels.push([methode, args]); return chaine; });
    }
    chaine.limit = vi.fn(async () => ({ data: rows, error: null }));
    return { appels, client: { rpc: vi.fn(async () => ({ data: "EUR", error: null })), from: vi.fn(() => chaine) } as never };
  };

  it("n’impose aucune borne : sans mois ni dates, tout l’historique", async () => {
    const { appels, client } = filtres();
    const bloc = vi.fn();
    await new FinanceTools(client, bloc).run("show_transactions", {});
    // Le seul « gte » qui pourrait exister serait une borne de date : il ne doit pas y en avoir.
    expect(appels.filter(([methode]) => methode === "gte")).toHaveLength(0);
    expect(bloc).toHaveBeenCalledWith(expect.objectContaining({ month: null }));
  });

  it("traite une borne fantaisiste comme une absence de borne", async () => {
    /* Le modèle, prié d'omettre le mois, envoie « toutes périodes confondues ». Le refus
       remontait à l'utilisateur sous la forme « je ne peux pas déterminer votre transaction la
       plus élevée » — le produit accusé d'une limite qu'il n'a pas. */
    const { parseToolArguments } = await import("@/lib/ai/assistant/tools");
    for (const valeur of ["toutes périodes confondues", "", "all", "depuis le début", "2026"]) {
      const analyse = parseToolArguments("show_transactions", JSON.stringify({ month: valeur }));
      expect(analyse.ok, valeur).toBe(true);
      expect((analyse as { args: { month?: string } }).args.month, valeur).toBeUndefined();
    }
    // Un mois valide reste un mois valide.
    expect((parseToolArguments("show_transactions", '{"month":"2026-08"}') as { args: { month?: string } }).args.month).toBe("2026-08");
  });

  it("accepte un mois", async () => {
    const { appels, client } = filtres();
    await new FinanceTools(client).run("show_transactions", { month: "2026-08" });
    expect(appels.find(([methode]) => methode === "gte")?.[1]).toEqual(["transaction_date", "2026-08-01T00:00:00.000Z"]);
  });

  it("accepte une période libre", async () => {
    const { appels, client } = filtres();
    await new FinanceTools(client).run("show_transactions", { from: "2025-01-15", to: "2025-03-01" });
    expect(appels.find(([methode]) => methode === "gte")?.[1]).toEqual(["transaction_date", "2025-01-15T00:00:00Z"]);
  });
});

describe("le bloc d’opérations", () => {
  const ligne = (over: Record<string, unknown> = {}) => ({
    id: "x", transaction_date: "2026-08-07T00:00:00Z", merchant_name: "EE T MOBILE",
    description: "", amount: -82.37, currency: "GBP", amount_base: -96.04, base_currency: "EUR",
    category: "Utilities", ...over
  });

  it("affiche le montant du relevé, dans sa devise, et non la conversion", async () => {
    const bloc = vi.fn();
    await new FinanceTools(clientTransactions([ligne()]), bloc).run("show_transactions", { month: "2026-08" });
    expect(bloc).toHaveBeenCalledWith(expect.objectContaining({
      type: "transactions",
      transactions: [expect.objectContaining({ amount: 82.37, currency: "GBP" })]
    }));
  });

  it("montre le nombre de lignes demandé, une fois les doublons réunis", async () => {
    // Le regroupement réduit : prélever la limite avant lui rendait deux lignes pour huit
    // demandées. La lecture est donc plus large que l'affichage.
    const bloc = vi.fn();
    const beaucoup = Array.from({ length: 24 }, (_, index) =>
      ligne({ id: `t${index}`, merchant_name: `COMMERÇANT ${Math.floor(index / 3)}`, amount: -(100 - index) }));
    await new FinanceTools(clientTransactions(beaucoup), bloc).run("show_transactions", { month: "2026-08", limit: 6 });
    const emis = bloc.mock.calls[0]![0] as { transactions: unknown[] };
    expect(emis.transactions).toHaveLength(6);
  });

  it("réunit les opérations identiques et en donne le compte", async () => {
    const bloc = vi.fn();
    await new FinanceTools(clientTransactions([
      ligne({ id: "a" }), ligne({ id: "b" }), ligne({ id: "c" }),
      ligne({ id: "d", merchant_name: "TESCO", amount: -12 })
    ]), bloc).run("show_transactions", { month: "2026-08" });
    const emis = bloc.mock.calls[0]![0] as { transactions: Array<{ merchant: string; count: number }> };
    expect(emis.transactions).toHaveLength(2);
    expect(emis.transactions[0]).toMatchObject({ merchant: "EE T MOBILE", count: 3 });
    expect(emis.transactions[1]).toMatchObject({ merchant: "TESCO", count: 1 });
  });
});
