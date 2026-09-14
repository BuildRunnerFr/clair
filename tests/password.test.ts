import { describe, expect, it } from "vitest";
import { checkPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

describe("règles de mot de passe", () => {
  it("accepte un mot de passe assez long", () => {
    expect(checkPassword("correct cheval batterie agrafe")).toBeNull();
    expect(checkPassword("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it("refuse en dessous de la longueur minimale", () => {
    expect(checkPassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toBe("too_short");
    expect(checkPassword("")).toBe("too_short");
    expect(checkPassword(undefined)).toBe("too_short");
  });

  it("compte la longueur en octets, comme le serveur", () => {
    // 72 émojis de 4 octets tiennent en 72 caractères mais font 288 octets : le refus doit
    // venir d'ici, avec un message clair, plutôt que du serveur.
    expect(checkPassword("😀".repeat(72))).toBe("too_long");
    expect(checkPassword("é".repeat(36))).toBeNull();
    expect(checkPassword("é".repeat(37))).toBe("too_long");
  });

  it("refuse l’adresse email comme mot de passe", () => {
    // C'est le premier essai sur un compte dont l'email a fuité ailleurs.
    expect(checkPassword("moi@exemple.fr", "moi@exemple.fr")).toBe("email_as_password");
    expect(checkPassword("  MOI@Exemple.FR  ", "moi@exemple.fr")).toBe("email_as_password");
  });

  it("n’applique cette règle que si une adresse est fournie", () => {
    expect(checkPassword("moi@exemple.fr")).toBeNull();
    expect(checkPassword("moi@exemple.fr", null)).toBeNull();
  });
});
