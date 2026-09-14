import { describe, expect, it } from "vitest";
import { destinationFor, parseConfirmationInput } from "@/lib/auth/confirm";

describe("liens de confirmation", () => {
  it("accepte les types que Supabase émet réellement", () => {
    // N'en accepter qu'un seul faisait échouer inscription et réinitialisation avec un
    // « type de lien non reconnu » que rien n'expliquait à l'utilisateur.
    for (const type of ["email", "magiclink", "signup", "recovery"]) {
      expect(parseConfirmationInput({ tokenHash: "safe-test-hash", type })).toEqual({ ok: true, tokenHash: "safe-test-hash", type });
    }
  });

  it("normalise la casse et les espaces", () => {
    expect(parseConfirmationInput({ tokenHash: " hash ", type: " Recovery " })).toEqual({ ok: true, tokenHash: "hash", type: "recovery" });
  });

  it.each([
    [{ tokenHash: null, type: "email" }, "missing_token"],
    [{ tokenHash: "  ", type: "email" }, "missing_token"],
    [{ tokenHash: "hash", type: null }, "invalid_type"],
    [{ tokenHash: "hash", type: "invite" }, "invalid_type"],
    [{ tokenHash: "hash", type: "email_change" }, "invalid_type"]
  ] as const)("rejette les paramètres mal formés", (input, reason) => {
    expect(parseConfirmationInput(input)).toEqual({ ok: false, reason });
  });
});

describe("destination après vérification", () => {
  it("envoie une réinitialisation vers le choix d’un nouveau mot de passe", () => {
    // Le lien ouvre une session valide, mais l'utilisateur n'a toujours pas de mot de passe
    // qu'il connaisse : il serait connecté ici et enfermé dehors partout ailleurs.
    expect(destinationFor("recovery")).toBe("/compte/mot-de-passe?reset=1");
  });

  it("envoie tout le reste au tableau de bord", () => {
    for (const type of ["email", "magiclink", "signup"] as const) {
      expect(destinationFor(type)).toBe("/dashboard");
    }
  });
});
