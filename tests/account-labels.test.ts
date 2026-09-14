import { describe, expect, it } from "vitest";
import { accountLabels } from "@/lib/accounts/label";

/**
 * Quatre comptes au même nom dans un sélecteur, indiscernables : c'est ce que produit une
 * banque qui ouvre un portefeuille par devise au nom du titulaire.
 */
const compte = (id: string, name: string, currency: string, providerAccountId?: string) => ({ id, name, currency, providerAccountId });

describe("le libellé d’un compte dans une liste", () => {
  it("porte la devise, qui est ce qui distingue les portefeuilles d’une même banque", () => {
    const labels = accountLabels([compte("1", "Camille Martin", "EUR"), compte("2", "Camille Martin", "AUD")]);
    expect(labels.get("1")).toBe("Camille Martin · EUR");
    expect(labels.get("2")).toBe("Camille Martin · AUD");
  });

  it("départage deux comptes qui partagent jusqu’à leur devise", () => {
    const labels = accountLabels([
      compte("1", "Compte courant", "EUR", "abcdef123456"),
      compte("2", "Compte courant", "EUR", "zzzzzz987654")
    ]);
    expect(labels.get("1")).toBe("Compte courant · EUR (…3456)");
    expect(labels.get("2")).toBe("Compte courant · EUR (…7654)");
  });

  it("n’encombre pas le cas courant du détail qui ne sert qu’aux collisions", () => {
    const labels = accountLabels([compte("1", "Compte courant", "EUR", "abcdef123456"), compte("2", "Livret", "EUR", "zz")]);
    expect(labels.get("1")).toBe("Compte courant · EUR");
  });
});
