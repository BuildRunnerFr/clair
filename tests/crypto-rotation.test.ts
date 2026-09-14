import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, encryptionKeys, needsRotation } from "@/lib/banking/truelayer/crypto";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

const withKeys = (value: string) => ({ BANK_TOKEN_ENCRYPTION_KEYS: value });
const withSingle = (value: string) => ({ BANK_TOKEN_ENCRYPTION_KEY: value });

describe("configuration des clés", () => {
  it("lit une liste versionnée, la première chiffrant", () => {
    const keys = encryptionKeys(withKeys(`v2:${KEY_B},v1:${KEY_A}`));
    expect(keys.map((item) => item.id)).toEqual(["v2", "v1"]);
  });

  it("accepte encore la variable historique, sous l’identifiant « legacy »", () => {
    // Sans quoi la mise à jour casserait toutes les installations existantes.
    expect(encryptionKeys(withSingle(KEY_A)).map((item) => item.id)).toEqual(["legacy"]);
  });

  it("refuse une configuration ambiguë ou fausse", () => {
    expect(() => encryptionKeys(withKeys(`v1:${KEY_A},v1:${KEY_B}`))).toThrow(/deux fois/);
    expect(() => encryptionKeys(withKeys(`${KEY_A}`))).toThrow(/mal formée/);
    expect(() => encryptionKeys(withKeys(`v 1:${KEY_A}`))).toThrow(/invalide/);
    expect(() => encryptionKeys(withKeys("v1:trop-court"))).toThrow(/32 octets/);
    expect(() => encryptionKeys({})).toThrow(/manquante/);
  });
});

describe("rotation", () => {
  it("déchiffre un jeton écrit avec une clé désormais ancienne", () => {
    // Le cœur de la rotation : on change de clé sans que personne ait à reconnecter sa banque.
    const before = encryptToken("jeton-secret", withKeys(`v1:${KEY_A}`));
    const after = decryptToken(before, withKeys(`v2:${KEY_B},v1:${KEY_A}`));
    expect(after).toBe("jeton-secret");
  });

  it("chiffre toujours avec la clé courante", () => {
    expect(encryptToken("x", withKeys(`v2:${KEY_B},v1:${KEY_A}`)).split(".")[0]).toBe("v2");
  });

  it("signale ce qui reste à réécrire", () => {
    const env = withKeys(`v2:${KEY_B},v1:${KEY_A}`);
    expect(needsRotation(encryptToken("x", withKeys(`v1:${KEY_A}`)), env)).toBe(true);
    expect(needsRotation(encryptToken("x", env), env)).toBe(false);
  });

  it("refuse un jeton chiffré avec une clé retirée de la configuration", () => {
    // Message explicite plutôt qu'échec de déchiffrement : l'erreur dit quelle clé rétablir.
    const orphan = encryptToken("x", withKeys(`v9:${KEY_A}`));
    expect(() => decryptToken(orphan, withKeys(`v2:${KEY_B}`))).toThrow(/v9/);
  });
});

describe("jetons d’avant les versions", () => {
  it("se déchiffrent encore, la clé étant retrouvée par authentification", () => {
    // Format historique à trois segments. GCM authentifie, donc essayer les clés l'une après
    // l'autre est sans ambiguïté : une mauvaise clé échoue au lieu de rendre des octets faux.
    const legacy = encryptToken("ancien-jeton", withSingle(KEY_A)).split(".").slice(1).join(".");
    expect(decryptToken(legacy, withKeys(`v2:${KEY_B},v1:${KEY_A}`))).toBe("ancien-jeton");
  });

  it("échouent clairement si aucune clé ne convient", () => {
    const legacy = encryptToken("x", withSingle(KEY_A)).split(".").slice(1).join(".");
    expect(() => decryptToken(legacy, withKeys(`v2:${KEY_B}`))).toThrow(/Aucune clé/);
  });

  it("sont toujours signalés comme à réécrire", () => {
    const legacy = encryptToken("x", withSingle(KEY_A)).split(".").slice(1).join(".");
    expect(needsRotation(legacy, withKeys(`v1:${KEY_A}`))).toBe(true);
  });
});

describe("intégrité", () => {
  it("refuse un jeton altéré", () => {
    const env = withKeys(`v1:${KEY_A}`);
    const [id, iv, tag, data] = encryptToken("jeton", env).split(".");
    expect(() => decryptToken([id, iv, tag, `${data}AA`].join("."), env)).toThrow();
  });

  it("refuse une forme inattendue", () => {
    expect(() => decryptToken("n-importe-quoi", withKeys(`v1:${KEY_A}`))).toThrow(/invalide/);
  });
});
