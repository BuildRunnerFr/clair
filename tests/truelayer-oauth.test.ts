import { describe, expect, it, vi } from "vitest";
import { completeTrueLayerCallback } from "@/lib/banking/truelayer/oauth-service";
import { hashOAuthState, randomOAuthState } from "@/lib/banking/truelayer/crypto";
import type { BankConnection } from "@/types/banking";

const connection: BankConnection = { id: "00000000-0000-0000-0000-000000000001", userId: "u1", provider: "truelayer", providerConnectionId: "v1:x", displayName: null, status: "active", environment: "sandbox", accountCount: 1, lastError: null, syncCursor: null, lastSyncedAt: null, authorizedAt: null, lastSyncDurationMs: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

describe("TrueLayer OAuth callback", () => {
  it("generates strong opaque state values and deterministic hashes", () => {
    const first = randomOAuthState();
    const second = randomOAuthState();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(hashOAuthState(first)).toHaveLength(64);
    expect(hashOAuthState(first)).toBe(hashOAuthState(first));
  });

  it("rejects an invalid or already consumed state before token exchange", async () => {
    const exchangeCode = vi.fn();
    await expect(completeTrueLayerCallback({ userId: "u1", code: "code", state: "bad", environment: "live" }, { states: { consumeState: async () => false }, tokens: { saveTokens: vi.fn() }, connections: { upsert: vi.fn() }, provider: { exchangeCode, getAccounts: vi.fn(), getInstitutionName: async () => null } })).rejects.toThrow("oauth_state_invalid");
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it("completes a successful mocked callback and stores tokens server-side", async () => {
    const saveTokens = vi.fn();
    const result = await completeTrueLayerCallback({ userId: "u1", code: "code", state: "valid", environment: "live" }, {
      states: { consumeState: async (userId) => userId === "u1" },
      tokens: { saveTokens },
      connections: { upsert: async () => connection },
      provider: { exchangeCode: async () => ({ accessToken: "access", refreshToken: "refresh", expiresAt: new Date("2026-08-23") }), getAccounts: async () => [{ providerAccountId: "acc-1", name: "Test", currency: "GBP" }], getInstitutionName: async () => "Revolut" }
    });
    expect(result.accounts).toHaveLength(1);
    expect(saveTokens).toHaveBeenCalledWith(connection.id, expect.objectContaining({ accessToken: "access" }));
  });
});

describe("environnement de la connexion créée", () => {
  it("enregistre la connexion dans l’environnement passé, sans le supposer", async () => {
    // Une connexion live enregistrée comme sandbox reste invisible : le tableau de bord
    // n'affiche que celles de l'environnement courant.
    const upsert = vi.fn(async () => ({ id: "c1" }) as never);
    await completeTrueLayerCallback(
      { userId: "u1", code: "code", state: "valid", environment: "live" },
      {
        states: { consumeState: async () => true },
        tokens: { saveTokens: vi.fn() },
        connections: { upsert },
        provider: {
          exchangeCode: async () => ({ accessToken: "a", refreshToken: "r", expiresAt: new Date() }),
          getAccounts: async () => [{ providerAccountId: "acc-1", name: "Revolut", currency: "EUR" }],
          getInstitutionName: async () => "Revolut"
        }
      } as never
    );
    // Le nom de la banque est enregistré avec la connexion : sans lui, deux banques s'affichent
    // à l'identique et rien ne dit laquelle synchroniser.
    expect(upsert).toHaveBeenCalledWith("u1", expect.any(String), "active", 1, "live", "Revolut");
  });
});
