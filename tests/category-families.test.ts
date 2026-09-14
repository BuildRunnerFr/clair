import { describe, expect, it } from "vitest";
import { CATEGORY_NAMES } from "@/lib/categories/taxonomy";
import { colorOf, familyOf, FAMILY_COLORS, FAMILY_COLORS_DARK } from "@/lib/categories/families";

describe("familles de catégories", () => {
  it("attribue une famille à chaque catégorie de la taxonomie", () => {
    for (const category of CATEGORY_NAMES) expect(familyOf(category)).toBeTruthy();
  });

  it("range dans « autre » ce qui n’appartient à aucune famille", () => {
    expect(familyOf("Uncategorized")).toBe("autre");
    expect(familyOf("Catégorie inventée")).toBe("autre");
  });

  it("garde une couleur stable pour une catégorie donnée", () => {
    // La couleur suit la catégorie, jamais son rang : sans cela, changer de mois repeindrait
    // les catégories survivantes et supprimerait toute reconnaissance.
    expect(colorOf("Restaurants")).toBe(colorOf("Coffee"));
    expect(colorOf("Housing")).not.toBe(colorOf("Restaurants"));
  });

  it("n’expose que six couleurs, au-delà desquelles l’œil ne distingue plus", () => {
    expect(Object.keys(FAMILY_COLORS)).toHaveLength(6);
    expect(new Set(Object.values(FAMILY_COLORS)).size).toBe(6);
  });

  it("déclare les deux thèmes, et les mêmes familles dans chacun", () => {
    // Le jeu sombre est choisi, pas déduit : éclaircir uniformément le jeu clair détruirait
    // l'étagement de luminosité qui sépare le teal du rose en vision deutéranope.
    expect(Object.keys(FAMILY_COLORS_DARK)).toEqual(Object.keys(FAMILY_COLORS));
    expect(new Set(Object.values(FAMILY_COLORS_DARK)).size).toBe(6);
    for (const family of Object.keys(FAMILY_COLORS)) {
      expect(FAMILY_COLORS_DARK[family as keyof typeof FAMILY_COLORS_DARK])
        .not.toBe(FAMILY_COLORS[family as keyof typeof FAMILY_COLORS]);
    }
  });

  it("rend une variable CSS, seule capable de suivre le thème", () => {
    // Une valeur littérale est calculée sur le serveur, qui ignore si le navigateur affiche en
    // clair ou en sombre. La variable est résolue au rendu.
    expect(colorOf("Restaurants")).toMatch(/^var\(--family-[a-z]+\)$/);
  });
});
