import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Les revenus ne dépendent pas d'une catégorie devinée.
 *
 * Ils en dépendaient : on additionnait les crédits dont la catégorie n'était pas « Transfers ».
 * Sur des données réelles, cela donnait zéro — les trente entrées d'argent d'un compte portaient
 * un libellé commençant par « FROM », et le classement les rangeait toutes en virement. Une
 * allocation, un salaire, un remboursement : tout disparaissait.
 *
 * Un virement entre comptes de l'utilisateur se reconnaît à sa forme. Ces affirmations gardent
 * la règle en place, faute de pouvoir exécuter du SQL ici.
 */
const sql = readFileSync(new URL("../supabase/migrations/032_income_without_category.sql", import.meta.url), "utf8");
const body = sql.slice(sql.indexOf("create function public.finance_month_flows"));

describe("règle des revenus", () => {
  it("ne filtre plus sur la catégorie", () => {
    expect(body).not.toMatch(/category\s*(<>|=)\s*'Transfers'/);
  });

  it("reconnaît un virement à sa contrepartie sur un autre compte", () => {
    expect(body).toContain("o.account_id <> s.account_id");
    expect(body).toContain("abs(o.amount_base + s.amount_base) < 0.01");
    // Une fenêtre de jours : un virement entre banques ne se règle pas dans la seconde.
    expect(body).toMatch(/interval '3 days'/);
  });

  it("reconnaît un compte à soi ailleurs, par le nom porté au libellé", () => {
    expect(body).toContain("p_self_names");
    // Un nom trop court apparierait n'importe quel marchand.
    expect(body).toContain("length(self.name) > 4");
  });

  it("compte les deux sens avec la même règle", () => {
    // Sans symétrie, l'argent mis de côté passerait pour dépensé d'un côté et pour un revenu
    // de l'autre : la différence des deux — ce qui reste — serait fausse deux fois.
    expect(body).toContain("filter (where amount_base > 0 and not internal)");
    expect(body).toContain("filter (where amount_base < 0 and not internal)");
  });

  it("reste cloisonnée par utilisateur", () => {
    expect(body).toContain("security invoker");
    expect((body.match(/auth\.uid\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("from public, anon");
  });
});
