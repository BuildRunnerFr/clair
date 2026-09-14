import { describe, expect, it, vi } from "vitest";
import { mapLimit, TrueLayerBankProvider } from "@/lib/banking/truelayer/truelayer-bank-provider";

const config = { clientId: "sandbox-client", clientSecret: "server-secret", redirectUri: "http://localhost:3000/api/banking/truelayer/callback", environment: "sandbox" as const, providers: "uk-cs-mock", endpoints: { authorization: "https://auth.truelayer-sandbox.com/", token: "https://auth.truelayer-sandbox.com/connect/token", data: "https://api.truelayer-sandbox.com/data/v1" } as const };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("TrueLayerBankProvider", () => {
  it("builds a Sandbox-only authorization URL with minimal scopes", () => {
    const url = new URL(new TrueLayerBankProvider(config).createAuthorizationUrl("secure-state"));
    expect(url.origin).toBe("https://auth.truelayer-sandbox.com");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(["info", "accounts", "balance", "transactions", "offline_access"]);
    expect(url.searchParams.get("providers")).toBe("uk-cs-mock");
    expect(url.search).not.toMatch(/payments|direct_debits|standing_orders|server-secret/);
  });

  it("exchanges and refreshes tokens with mocked HTTP", async () => {
    const http = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600 }))
      .mockResolvedValueOnce(response({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600 }));
    const provider = new TrueLayerBankProvider(config, undefined, http);
    expect((await provider.exchangeCode("one-time-code")).refreshToken).toBe("refresh-1");
    expect((await provider.refreshAccessToken("refresh-1")).accessToken).toBe("access-2");
    const firstBody = http.mock.calls[0][1]?.body as URLSearchParams;
    const secondBody = http.mock.calls[1][1]?.body as URLSearchParams;
    expect(firstBody.get("grant_type")).toBe("authorization_code");
    expect(secondBody.get("grant_type")).toBe("refresh_token");
  });

  it("maps accounts, balances, settled and pending transactions", async () => {
    const http = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/accounts")) return response({ results: [{ account_id: "acc-1", display_name: "Sandbox Current", currency: "GBP", account_type: "TRANSACTION" }] });
      if (url.includes("/balance")) return response({ results: [{ currency: "GBP", current: 900, available: 850 }] });
      if (url.includes("/transactions/pending")) return response({ results: [{ transaction_id: "pending-raw", normalised_provider_transaction_id: "stable-1", timestamp: "2026-08-20T00:00:00Z", description: "COFFEE", amount: -4.5, currency: "GBP", merchant_name: "Coffee" }] });
      if (url.includes("/transactions")) return response({ results: [{ transaction_id: "settled-raw", normalised_provider_transaction_id: "stable-2", timestamp: "2026-08-19T00:00:00Z", description: "TRAIN", amount: -20, currency: "GBP", merchant_name: "Rail" }] });
      return response({}, 404);
    });
    const provider = new TrueLayerBankProvider(config, "access", http);
    expect(await provider.getAccounts("connection")).toEqual([{ providerAccountId: "acc-1", name: "Sandbox Current", currency: "GBP" }]);
    expect((await provider.getBalances(["acc-1"]))[0]).toMatchObject({ providerAccountId: "acc-1", current: 900, currency: "GBP" });
    const transactions = await provider.getTransactions("connection", new Date("2026-08-01"), new Date("2026-08-31"));
    expect(transactions.map((item) => [item.providerTransactionId, item.pending])).toEqual([["stable-2", false], ["stable-1", true]]);
    expect(provider.getMetrics()).toMatchObject({ httpCalls: 4 });
  });

  it("follows controlled transaction pagination when a cursor is returned", async () => {
    const http = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/accounts")) return response({ results: [{ account_id: "acc-1", currency: "GBP" }] });
      if (url.pathname.endsWith("/pending")) return response({ results: [] });
      if (url.searchParams.get("cursor") === "page-2") return response({ results: [{ transaction_id: "two", timestamp: "2026-08-02T00:00:00Z", amount: -2, currency: "GBP" }] });
      return response({ results: [{ transaction_id: "one", timestamp: "2026-08-01T00:00:00Z", amount: -1, currency: "GBP" }], next_cursor: "page-2" });
    });
    const provider = new TrueLayerBankProvider(config, "access", http);
    expect(await provider.getTransactions("c", new Date("2026-08-01"), new Date("2026-08-03"))).toHaveLength(2);
    expect(provider.getMetrics().transactionRequests.find((item) => item.kind === "settled")?.pages).toBe(2);
  });

  it("limits concurrent provider work", async () => {
    let active = 0;
    let maximum = 0;
    await mapLimit(Array.from({ length: 12 }, (_, index) => index), 4, async (item) => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      return item;
    });
    expect(maximum).toBe(4);
  });
});

describe("nom de la banque", () => {
  const nameFrom = async (body: unknown, status = 200) =>
    new TrueLayerBankProvider(config, "token", vi.fn<typeof fetch>(async () => response(body, status))).getInstitutionName();

  it("lit le nom renvoyé par l’agrégateur", async () => {
    expect(await nameFrom({ results: [{ provider: { display_name: "Crédit Agricole" } }] })).toBe("Crédit Agricole");
  });

  it("renvoie null plutôt que d’échouer quand la réponse change de forme", async () => {
    // Une connexion sans nom reste utilisable ; une connexion refusée parce que /me a bougé, non.
    // Le nom n'est qu'un libellé, il ne doit jamais faire échouer une connexion bancaire.
    expect(await nameFrom({ results: [] })).toBeNull();
    expect(await nameFrom({ results: [{ provider: {} }] })).toBeNull();
    expect(await nameFrom({ autre_chose: true })).toBeNull();
    expect(await nameFrom({ results: [{ provider: { display_name: "   " } }] })).toBeNull();
  });

  it("renvoie null quand l’appel échoue, sans propager l’erreur", async () => {
    expect(await nameFrom({ error: "unauthorized" }, 401)).toBeNull();
  });

  it("borne la longueur, le nom venant d’un tiers", async () => {
    expect((await nameFrom({ results: [{ provider: { display_name: "x".repeat(200) } }] }))!.length).toBe(80);
  });
});
