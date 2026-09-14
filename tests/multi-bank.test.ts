import { describe, expect, it } from "vitest";
import { syncTransactions } from "@/lib/banking/sync-transactions";
import { InMemoryTransactionRepository } from "@/lib/db/transaction-repository";
import { detectRecurringIncome, detectSubscriptions } from "@/lib/subscriptions/detect";
import { syncWindow } from "@/lib/banking/history-window";
import type { BankProvider } from "@/lib/banking/bank-provider";

/**
 * Deux banques sur un même compte.
 *
 * Le cas s'est déjà mal comporté une fois — l'interface ne retenait qu'une connexion, si bien
 * que la seconde devenait invisible et ne pouvait plus être synchronisée alors que ses
 * transactions comptaient dans tous les totaux. Ce qui suit couvre ce que la correction doit
 * garantir, et ce que les écritures à portée utilisateur risquent de casser.
 */
const account = (id: string, userId: string, providerAccountId: string, currency = "EUR") => ({
  id, userId, provider: "truelayer", providerAccountId, name: id, currency,
  balanceCurrent: null, balanceAvailable: null, balanceOverdraft: null, balanceUpdatedAt: null,
  createdAt: new Date().toISOString()
});

function bank(name: string, providerAccountId: string, merchants: Array<{ id: string; merchant: string; amount: number; date: string }>): BankProvider {
  return {
    name: "truelayer",
    connect: async () => ({ connectionId: name, status: "ready" }),
    getAccounts: async () => [{ providerAccountId, name, currency: "EUR" }],
    getTransactions: async () => merchants.map((item) => ({
      providerTransactionId: item.id, providerAccountId, merchantName: item.merchant, description: item.merchant,
      amount: item.amount, currency: "EUR", transactionDate: item.date, pending: false
    }))
  };
}

const range = { from: new Date("2026-06-01"), to: new Date("2026-09-01") };

describe("deux banques sur un même compte", () => {
  it("garde les opérations des deux, sans que l’une efface l’autre", async () => {
    const repository = new InMemoryTransactionRepository([
      account("a1", "u1", "revolut-1"),
      account("a2", "u1", "sg-1")
    ]);
    const revolut = bank("Revolut", "revolut-1", [{ id: "r1", merchant: "SPOTIFY", amount: -11.99, date: "2026-08-02T00:00:00.000Z" }]);
    const societe = bank("Société Générale", "sg-1", [{ id: "s1", merchant: "LOYER", amount: -700, date: "2026-08-05T00:00:00.000Z" }]);

    await syncTransactions("u1", "revolut", revolut, repository, range);
    await syncTransactions("u1", "sg", societe, repository, range);

    expect(repository.all().map((item) => item.merchantName).sort()).toEqual(["LOYER", "SPOTIFY"]);
    // La synchronisation de la seconde banque ne doit pas rejouer ni retirer la première.
    const again = await syncTransactions("u1", "revolut", revolut, repository, range);
    expect(again.added).toBe(0);
    expect(repository.all()).toHaveLength(2);
  });

  it("compte les comptes par connexion, et non par utilisateur", async () => {
    const repository = new InMemoryTransactionRepository([account("a1", "u1", "revolut-1"), account("a2", "u1", "sg-1")]);
    const revolut = bank("Revolut", "revolut-1", [{ id: "r1", merchant: "SPOTIFY", amount: -11.99, date: "2026-08-02T00:00:00.000Z" }]);
    const summary = await syncTransactions("u1", "revolut", revolut, repository, range);
    // Deux comptes existent chez l'utilisateur ; cette connexion n'en porte qu'un, et c'est ce
    // nombre qui doit être annoncé à côté de la banque.
    expect(summary.accountCount).toBe(1);
  });

  it("donne à chaque connexion sa propre fenêtre d’historique", () => {
    const now = new Date("2026-09-05T12:00:00Z");
    // Une banque synchronisée hier repart d'hier ; une banque tout juste autorisée remonte loin.
    const routine = syncWindow({ lastSyncedAt: new Date("2026-09-04T00:00:00Z"), authorizedAt: null, now });
    const fresh = syncWindow({ lastSyncedAt: null, authorizedAt: new Date("2026-09-05T11:59:00Z"), now });
    expect(routine.backfill).toBe(false);
    expect(fresh.backfill).toBe(true);
    expect(fresh.from.getTime()).toBeLessThan(routine.from.getTime());
  });

  it("ne détecte qu’une fois un abonnement, quelle que soit la banque qui déclenche la détection", () => {
    // La détection porte sur toutes les transactions de l'utilisateur, et les deux
    // synchronisations la rejouent : elles doivent aboutir au même ensemble, sans doublon.
    const flows = [0, 1, 2].map((month) => ({ merchantName: "SPOTIFY", amount: -11.99, currency: "EUR", transactionDate: `2026-0${7 + month}-02T00:00:00.000Z` }))
      .concat([0, 1, 2].map((month) => ({ merchantName: "SALAIRE", amount: 2400, currency: "EUR", transactionDate: `2026-0${7 + month}-28T00:00:00.000Z` })));
    const today = new Date("2026-09-30");
    const first = detectSubscriptions(flows, today);
    const second = detectSubscriptions(flows, today);
    expect(first).toEqual(second);
    expect(first.map((item) => item.merchantName)).toEqual(["SPOTIFY"]);
    expect(detectRecurringIncome(flows, today).map((item) => item.merchantName)).toEqual(["SALAIRE"]);
    // La clé qui rend l'écriture idempotente : marchand, devise, sens.
    const keys = [...first, ...detectRecurringIncome(flows, today)].map((item) => `${item.merchantName}|${item.currency}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
