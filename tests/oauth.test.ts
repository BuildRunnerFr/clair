import { describe, expect, it } from "vitest";
import { parseProvider, safeNext } from "@/lib/auth/oauth";

describe("fournisseur d’identification", () => {
  it("accepte les seuls fournisseurs prévus", () => {
    expect(parseProvider("google")).toBe("google");
    expect(parseProvider(" Apple ")).toBe("apple");
  });

  it("refuse tout le reste, le formulaire n’étant pas une source de confiance", () => {
    for (const value of ["facebook", "", "GOOGLE ; drop", null, undefined, 42, { provider: "google" }])
      expect(parseProvider(value)).toBeNull();
  });
});

describe("destination après connexion", () => {
  it("garde un chemin de ce site", () => {
    expect(safeNext("/budgets")).toBe("/budgets");
    expect(safeNext("/transactions?query=airbnb&page=2")).toBe("/transactions?query=airbnb&page=2");
    expect(safeNext("/mon-compte")).toBe("/mon-compte"); // un tiret n'a rien de suspect
  });

  it("rejette une URL absolue, c’est-à-dire une redirection ouverte", () => {
    // Le cas classique : la victime vient de s'authentifier, elle est en confiance, et se
    // retrouve sur une copie du site qui lui redemande ses identifiants.
    for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)"])
      expect(safeNext(value)).toBe("/dashboard");
  });

  it("rejette un schéma caché derrière un chemin", () => {
    expect(safeNext("/redirect:https://evil.example")).toBe("/dashboard");
  });

  it("rejette espaces et caractères de contrôle, qu’un navigateur retire avant de lire l’URL", () => {
    expect(safeNext("/\tjavascript:alert(1)")).toBe("/dashboard");
    expect(safeNext("/dash board")).toBe("/dashboard");
    expect(safeNext("/ evil")).toBe("/dashboard");
  });

  it("retombe sur le tableau de bord quand rien n’est demandé", () => {
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
    expect(safeNext("budgets")).toBe("/dashboard"); // relatif, donc ambigu
  });
});
