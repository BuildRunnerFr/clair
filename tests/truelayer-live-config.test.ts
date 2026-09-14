import { describe, expect, it } from "vitest";
import { bankEnvironmentFrom, buildTrueLayerConfig, LIVE_ACKNOWLEDGEMENT, TRUELAYER_ENDPOINTS } from "@/lib/banking/truelayer/config-schema";

const key = Buffer.alloc(32, 0);
key.write("une-cle-de-32-octets-bien-random");
const validKey = key.toString("base64");

const sandbox = {
  clientId: "id",
  clientSecret: "secret",
  redirectUri: "http://localhost:3000/api/banking/truelayer/callback",
  environment: "sandbox" as const
};

const live = {
  ...sandbox,
  environment: "live" as const,
  redirectUri: "https://clair.example.com/api/banking/truelayer/callback",
  acknowledgement: LIVE_ACKNOWLEDGEMENT,
  encryptionKey: validKey
};

describe("configuration TrueLayer", () => {
  it("laisse le sandbox fonctionner sans cérémonie et vise les hôtes sandbox", () => {
    const config = buildTrueLayerConfig(sandbox);
    expect(config.endpoints).toEqual(TRUELAYER_ENDPOINTS.sandbox);
  });

  it("bascule sur les hôtes de production quand le live est correctement déclaré", () => {
    const config = buildTrueLayerConfig(live);
    expect(config.endpoints).toEqual(TRUELAYER_ENDPOINTS.live);
    expect(config.endpoints.data).not.toContain("sandbox");
  });
});

describe("garde-fous du passage en live", () => {
  it("refuse le live sur la seule variable d’environnement", () => {
    // Le cœur du garde-fou : TRUELAYER_ENV=live ne suffit pas.
    expect(() => buildTrueLayerConfig({ ...live, acknowledgement: undefined })).toThrow(/TRUELAYER_LIVE_CONFIRMED/);
  });

  it("refuse une reconnaissance approximative", () => {
    expect(() => buildTrueLayerConfig({ ...live, acknowledgement: "true" })).toThrow(/TRUELAYER_LIVE_CONFIRMED/);
  });

  it("refuse une URL de redirection en http", () => {
    expect(() => buildTrueLayerConfig({ ...live, redirectUri: "http://clair.example.com/callback" })).toThrow(/https/);
  });

  it("refuse une clé de chiffrement absente ou de mauvaise taille", () => {
    expect(() => buildTrueLayerConfig({ ...live, encryptionKey: undefined })).toThrow(/32 octets/);
    expect(() => buildTrueLayerConfig({ ...live, encryptionKey: Buffer.alloc(16, 7).toString("base64") })).toThrow(/32 octets/);
  });

  it("refuse une clé de remplissage, qui a la bonne taille mais aucune entropie", () => {
    expect(() => buildTrueLayerConfig({ ...live, encryptionKey: Buffer.alloc(32, 0).toString("base64") })).toThrow(/remplissage/);
  });

  it("n’impose aucune de ces contraintes au sandbox", () => {
    // Le sandbox reste en http et sans clé : y appliquer les règles du live rendrait le
    // développement local impraticable sans rien protéger.
    expect(() => buildTrueLayerConfig(sandbox)).not.toThrow();
  });

  it("énonce toutes les raisons d’un refus, pas seulement la première", () => {
    const failure = () => buildTrueLayerConfig({ ...live, acknowledgement: undefined, redirectUri: "http://x.example.com/cb", encryptionKey: undefined });
    expect(failure).toThrow(/TRUELAYER_LIVE_CONFIRMED/);
    expect(failure).toThrow(/https/);
    expect(failure).toThrow(/32 octets/);
  });
});

describe("environnement courant", () => {
  it("ne considère live que sur une valeur explicite", () => {
    expect(bankEnvironmentFrom("live")).toBe("live");
    expect(bankEnvironmentFrom(" LIVE ")).toBe("live");
  });

  it("retombe sur sandbox pour tout le reste, y compris l’absence de valeur", () => {
    // Le défaut doit être l'environnement inoffensif : une variable oubliée ne doit jamais
    // faire passer l'application pour connectée à de vraies banques.
    expect(bankEnvironmentFrom(undefined)).toBe("sandbox");
    expect(bankEnvironmentFrom("")).toBe("sandbox");
    expect(bankEnvironmentFrom("production")).toBe("sandbox");
  });
});
