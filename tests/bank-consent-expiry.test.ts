import { describe, expect, it } from "vitest";
import { TrueLayerBankProvider } from "@/lib/banking/truelayer/truelayer-bank-provider";
import { isBankAuthorizationError } from "@/lib/banking/bank-provider";

const config = {
  clientId: "id",
  clientSecret: "secret",
  redirectUri: "http://localhost:3000/cb",
  environment: "sandbox" as const,
  providers: "uk-cs-mock",
  endpoints: {
    authorization: "https://auth.truelayer-sandbox.com/",
    token: "https://auth.truelayer-sandbox.com/connect/token",
    data: "https://api.truelayer-sandbox.com/data/v1"
  } as const
};

const respondWith = (status: number, body = "") => async () => new Response(status === 200 ? JSON.stringify({ results: [] }) : body, { status });

describe("expiration du consentement bancaire", () => {
  it("signale une réautorisation quand la Data API répond 401", async () => {
    const provider = new TrueLayerBankProvider(config, "expired-token", respondWith(401));
    await expect(provider.getAccounts("c1")).rejects.toSatisfy(isBankAuthorizationError);
  });

  it("signale une réautorisation sur un 403", async () => {
    const provider = new TrueLayerBankProvider(config, "revoked-token", respondWith(403));
    await expect(provider.getAccounts("c1")).rejects.toSatisfy(isBankAuthorizationError);
  });

  it("signale une réautorisation quand le refresh token est rejeté", async () => {
    // TrueLayer répond 400 à un refresh token expiré ou révoqué : c'est la fin du
    // consentement, pas une panne passagère.
    const provider = new TrueLayerBankProvider(config, undefined, respondWith(400, JSON.stringify({ error: "invalid_grant" })));
    await expect(provider.refreshAccessToken("dead-refresh-token")).rejects.toSatisfy(isBankAuthorizationError);
  });

  it("n’impute pas à l’utilisateur des identifiants d’application refusés", async () => {
    // Même statut, même guichet, cause opposée : c'est l'application que TrueLayer refuse, et
    // aucune reconnexion bancaire n'y changerait rien. Marquer la connexion « à réautoriser »
    // enverrait chaque utilisateur refaire un parcours voué à échouer, en rendant l'incident
    // invisible puisqu'il serait imputé aux utilisateurs.
    const provider = new TrueLayerBankProvider(config, undefined, respondWith(400, JSON.stringify({ error: "invalid_client" })));
    await expect(provider.refreshAccessToken("good-refresh-token")).rejects.toSatisfy((error) => !isBankAuthorizationError(error));
  });

  it("consigne le statut et l’appel qui a échoué", async () => {
    // Sans eux, « le consentement a expiré » recouvre trois causes distinctes et le journal ne
    // permet pas de les départager des mois plus tard.
    const provider = new TrueLayerBankProvider(config, "revoked-token", respondWith(403));
    await expect(provider.getAccounts("c1")).rejects.toMatchObject({ cause: { status: 403, operation: "data_accounts" } });
  });

  it("ne confond pas une panne du fournisseur avec une expiration", async () => {
    // Le point entier de la distinction : un 500 se réessaie, une expiration jamais.
    const provider = new TrueLayerBankProvider(config, "valid-token", respondWith(500));
    await expect(provider.getAccounts("c1")).rejects.toSatisfy((error) => !isBankAuthorizationError(error));
  });

  it("ne confond pas un dépassement de quota avec une expiration", async () => {
    const provider = new TrueLayerBankProvider(config, "valid-token", respondWith(429));
    await expect(provider.getAccounts("c1")).rejects.toSatisfy((error) => !isBankAuthorizationError(error));
  });

  it("porte un message qui dit quoi faire, pas seulement qu’il y a eu un échec", async () => {
    const provider = new TrueLayerBankProvider(config, "expired-token", respondWith(401));
    await expect(provider.getAccounts("c1")).rejects.toThrow(/Reconnectez votre banque/);
  });
});
