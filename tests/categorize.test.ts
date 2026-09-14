import { describe, expect, it } from "vitest";
import { categorizeMerchant, normalizeMerchant } from "@/lib/rules/categorize";

describe("categorization rules", () => {
  it("normalizes noisy merchant names and technical suffixes", () => {
    expect(normalizeMerchant("STARBUCKS 03842 LONDON")).toBe("STARBUCKS");
    expect(normalizeMerchant("UBER *TRIP HELP.UBER.COM")).toBe("UBER");
    expect(normalizeMerchant("AMZN Mktp UK*AB123")).toBe("AMAZON");
    expect(normalizeMerchant("OVO ENERGY LTD")).toBe("OVO ENERGY");
  });
  it("uses a saved rule before defaults", () => {
    const result = categorizeMerchant("Grab", [{ userId: "u1", merchantPattern: "GRAB", category: "Transport", subcategory: "Taxi", source: "manual" }]);
    expect(result).toMatchObject({ category: "Transport", subcategory: "Taxi", source: "manual" });
  });
  it("falls back safely", () => expect(categorizeMerchant("Mystery Shop").category).toBe("Uncategorized"));
});

describe("virements entre particuliers", () => {
  it("classe en virement sans jamais interroger l’IA", () => {
    // L'enjeu n'est pas la catégorie mais le fait que ces libellés contiennent des noms de
    // personnes : résolus localement, ils ne partent jamais chez un tiers.
    expect(categorizeMerchant("TO JULIEN MARC ANTOINE LEROY")).toMatchObject({ category: "Transfers", subcategory: "Bank Transfer" });
    expect(categorizeMerchant("FROM SOPHIE R")).toMatchObject({ category: "Transfers" });
    expect(categorizeMerchant("from adam t")).toMatchObject({ category: "Transfers" });
  });

  it("n’attrape pas les commerçants qui contiennent seulement ces lettres", () => {
    // Le motif est ancré : une correspondance par inclusion ferait de « AUTO » un virement.
    expect(categorizeMerchant("TOTAL ENERGIES").category).not.toBe("Transfers");
    expect(categorizeMerchant("AUTOROUTES DU SUD").category).not.toBe("Transfers");
    expect(categorizeMerchant("TOKYO SUSHI").category).not.toBe("Transfers");
  });

  it("laisse une règle de l’utilisateur l’emporter", () => {
    const rule = { userId: "u1", merchantPattern: "TO JULIEN MARC ANTOINE LEROY", normalizedMerchant: "TO JULIEN MARC ANTOINE LEROY", category: "Housing", subcategory: "Rent", source: "manual" as const, confidence: 1 };
    expect(categorizeMerchant("TO JULIEN MARC ANTOINE LEROY", [rule])).toMatchObject({ category: "Housing", subcategory: "Rent" });
  });
});
