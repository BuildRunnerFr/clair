import { describe, expect, it } from "vitest";
import { confirmsDeletion } from "@/lib/auth/account-deletion";

describe("confirmation de suppression", () => {
  it("accepte l’adresse exacte", () => {
    expect(confirmsDeletion("moi@exemple.fr", "moi@exemple.fr")).toBe(true);
  });

  it("tolère la casse et les espaces de bord, qu’un copier-coller ajoute", () => {
    expect(confirmsDeletion("  MOI@Exemple.FR ", "moi@exemple.fr")).toBe(true);
  });

  it("refuse une adresse approchante", () => {
    // Effacer un compte sur une faute de frappe serait pire que de le refuser sur une.
    expect(confirmsDeletion("moi@exemple.com", "moi@exemple.fr")).toBe(false);
    expect(confirmsDeletion("moi@exemple", "moi@exemple.fr")).toBe(false);
    expect(confirmsDeletion("", "moi@exemple.fr")).toBe(false);
  });

  it("refuse toujours quand le compte n’a pas d’adresse", () => {
    // Sans quoi deux valeurs vides se valideraient l'une l'autre, et un formulaire soumis à
    // vide suffirait à tout effacer.
    expect(confirmsDeletion("", undefined)).toBe(false);
    expect(confirmsDeletion("", null)).toBe(false);
    expect(confirmsDeletion("n’importe quoi", "")).toBe(false);
  });

  it("refuse ce qui n’est pas une chaîne", () => {
    expect(confirmsDeletion(null, "moi@exemple.fr")).toBe(false);
    expect(confirmsDeletion(42, "moi@exemple.fr")).toBe(false);
  });
});
