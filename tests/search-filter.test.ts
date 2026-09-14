import { describe, expect, it } from "vitest";
import { buildSearchFilter } from "@/lib/db/search-filter";

const build = (query: string) => buildSearchFilter(query, ["merchant_name", "description"]);

describe("filtre de recherche", () => {
  it("cherche le terme dans chaque colonne", () => {
    expect(build("airbnb")).toBe('merchant_name.ilike."%airbnb%",description.ilike."%airbnb%"');
  });

  it("ne produit aucun filtre pour une saisie vide", () => {
    expect(build("   ")).toBeNull();
  });

  it("neutralise les jokers, qu’une saisie littérale ne doit pas déclencher", () => {
    // Sans cet échappement, chercher « 100% » ramènerait toutes les transactions.
    // L'anti-slash est doublé à dessein : la première passe échappe « % » pour LIKE, la
    // seconde échappe cet anti-slash pour la syntaxe PostgREST, qui le retire à la lecture.
    // C'est donc « \% » qui parvient à l'opérateur ilike.
    expect(build("100%")).toContain(String.raw`100\\%`);
    expect(build("a_b")).toContain(String.raw`a\\_b`);
  });

  it("guillemette la valeur, sans quoi une virgule casse l’analyse du filtre", () => {
    // Constaté en test : « 100% , ' » faisait échouer la requête entière côté PostgREST,
    // la virgule y séparant les conditions d'un `or`.
    const filter = build("Paris, France");
    expect(filter).toContain('"%Paris, France%"');
    expect(() => new URLSearchParams({ or: `(${filter})` })).not.toThrow();
  });

  it("échappe les guillemets et anti-slashs contenus dans la saisie", () => {
    expect(build('dit "bonjour"')).toContain(String.raw`\"bonjour\"`);
    expect(build("a\\b")).toContain(String.raw`a\\\\b`);
  });
});
