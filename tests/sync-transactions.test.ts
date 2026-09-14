import { describe, expect, it } from "vitest";
import { MockBankProvider } from "@/lib/banking/mock-bank-provider";
import { syncTransactions } from "@/lib/banking/sync-transactions";
import { InMemoryTransactionRepository } from "@/lib/db/transaction-repository";
import type { BankProvider } from "@/lib/banking/bank-provider";
import type { AIProvider } from "@/lib/ai/ai-provider";
import { vi } from "vitest";

const account = (id: string, userId: string, providerAccountId: string) => ({ id, userId, provider: "mock", providerAccountId, name: id, currency: providerAccountId.endsWith("eur") ? "EUR" : "MYR", balanceCurrent: null, balanceAvailable: null, balanceOverdraft: null, balanceUpdatedAt: null, createdAt: new Date().toISOString() });

describe("transaction synchronization", () => {
  it("is idempotent and categorizes inserted transactions", async () => {
    const provider = new MockBankProvider();
    const repository = new InMemoryTransactionRepository([account("a1", "u1", "mock_eur"), account("a2", "u1", "mock_myr")]);
    const range = { from: new Date("2026-08-01"), to: new Date("2026-08-31") };
    const first = await syncTransactions("u1", "mock_u1", provider, repository, range);
    const second = await syncTransactions("u1", "mock_u1", provider, repository, range);
    expect(first.added).toBeGreaterThan(0);
    expect(first.errors).toEqual([]);
    expect(second).toMatchObject({ added: 0, ignored: first.added, errors: [] });
    expect(repository.all().find((item) => item.merchantName.includes("STARBUCKS"))?.subcategory).toBe("Coffee");
  });

  it("keeps users isolated in repository reads", async () => {
    const repository = new InMemoryTransactionRepository([account("a1", "u1", "mock_eur"), account("a2", "u2", "mock_eur")]);
    expect(await repository.findAccounts("u1")).toHaveLength(1);
    expect((await repository.findAccounts("u1"))[0].userId).toBe("u1");
  });

  it("updates a pending transaction when the stable provider id settles", async () => {
    let pending = true;
    const provider: BankProvider = {
      name: "truelayer",
      connect: async () => ({ connectionId: "c", status: "ready" }),
      getAccounts: async () => [{ providerAccountId: "external", name: "Sandbox", currency: "GBP" }],
      getTransactions: async () => [{ providerTransactionId: "stable-id", providerAccountId: "external", merchantName: "Coffee", description: pending ? "PENDING COFFEE" : "COFFEE", amount: -5, currency: "GBP", transactionDate: "2026-08-20T00:00:00.000Z", pending }]
    };
    const repository = new InMemoryTransactionRepository([account("a1", "u1", "external")]);
    const range = { from: new Date("2026-08-01"), to: new Date("2026-08-31") };
    expect((await syncTransactions("u1", "c", provider, repository, range)).added).toBe(1);
    pending = false;
    const settled = await syncTransactions("u1", "c", provider, repository, range);
    expect(settled.updated).toBe(1);
    expect(repository.all()).toHaveLength(1);
    expect(repository.all()[0].pending).toBe(false);
  });

  it("writes a synchronization as one repository batch and returns timing metadata", async () => {
    class ObservedRepository extends InMemoryTransactionRepository {
      calls = 0;
      override async upsertTransactions(transactions: Parameters<InMemoryTransactionRepository["upsertTransactions"]>[0]) {
        this.calls++;
        return super.upsertTransactions(transactions);
      }
    }
    const repository = new ObservedRepository([]);
    const summary = await syncTransactions("u1", "mock", new MockBankProvider(), repository, { from: new Date("2026-08-01"), to: new Date("2026-08-31") });
    expect(repository.calls).toBe(1);
    expect(summary).toMatchObject({ accountCount: 2, databaseBatches: 1 });
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("deduplicates before AI and preserves an existing manual category", async () => {
    const existing = { userId: "u1", accountId: "a1", providerTransactionId: "known", merchantName: "UNKNOWN SHOP", description: "UNKNOWN SHOP", amount: -10, currency: "GBP", transactionDate: "2026-08-20T00:00:00.000Z", category: "Shopping", subcategory: "Other", categorySource: "manual" as const, categoryConfidence: 1, categorizedAt: "2026-08-20T01:00:00.000Z", pending: false };
    const repository = new InMemoryTransactionRepository([{ ...account("a1", "u1", "external"), provider: "mock", currency: "GBP" }], [], [existing]);
    const provider: BankProvider = { name: "mock", connect: async () => ({ connectionId: "c", status: "ready" }), getAccounts: async () => [{ providerAccountId: "external", name: "GBP", currency: "GBP" }], getTransactions: async () => [{ providerTransactionId: "known", providerAccountId: "external", merchantName: "UNKNOWN SHOP", description: "UNKNOWN SHOP", amount: -10, currency: "GBP", transactionDate: "2026-08-20T00:00:00.000Z", pending: false }] };
    const aiProvider: AIProvider = { categorizeTransaction: vi.fn() };
    await syncTransactions("u1", "c", provider, repository, { from: new Date("2026-08-01"), to: new Date("2026-08-31") }, aiProvider);
    expect(aiProvider.categorizeTransaction).not.toHaveBeenCalled();
    expect(repository.all()[0]).toMatchObject({ category: "Shopping", categorySource: "manual" });
  });
});

describe("account balances", () => {
  const balanceProvider = (getBalances: BankProvider["getBalances"]): BankProvider => ({
    name: "mock",
    connect: async () => ({ connectionId: "c1", status: "ready" }),
    getAccounts: async () => [{ providerAccountId: "mock_eur", name: "Compte EUR", currency: "EUR" }],
    getTransactions: async () => [],
    getBalances
  });

  it("stores the balance reported by the provider", async () => {
    const repository = new InMemoryTransactionRepository([account("a1", "u1", "mock_eur")]);
    const provider = balanceProvider(async () => [{ providerAccountId: "mock_eur", currency: "EUR", current: 1250.5, available: 1200, updatedAt: "2026-09-01T10:00:00.000Z" }]);
    const summary = await syncTransactions("u1", "c1", provider, repository);
    expect(summary.balancesUpdated).toBe(1);
    expect(summary.balanceError).toBeUndefined();
    const [stored] = await repository.findAccounts("u1");
    expect(stored).toMatchObject({ balanceCurrent: 1250.5, balanceAvailable: 1200, balanceUpdatedAt: "2026-09-01T10:00:00.000Z" });
  });

  it("keeps the sync successful when the balance call fails", async () => {
    const repository = new InMemoryTransactionRepository([account("a1", "u1", "mock_eur")]);
    const provider = balanceProvider(async () => { throw new Error("Solde TrueLayer indisponible."); });
    const summary = await syncTransactions("u1", "c1", provider, repository);
    expect(summary.balanceError).toBe("Solde TrueLayer indisponible.");
    expect(summary.balancesUpdated).toBe(0);
    expect(summary.errors).toHaveLength(0);
    const [stored] = await repository.findAccounts("u1");
    expect(stored!.balanceCurrent).toBeNull();
  });

  it("leaves balances untouched for a provider that does not support them", async () => {
    const repository = new InMemoryTransactionRepository([account("a1", "u1", "mock_eur")]);
    const summary = await syncTransactions("u1", "c1", balanceProvider(undefined), repository);
    expect(summary.balancesUpdated).toBe(0);
    expect(summary.balanceError).toBeUndefined();
  });
});

describe("valorisation en devise principale pendant la synchronisation", () => {
  const gbpProvider: BankProvider = {
    name: "truelayer",
    connect: async () => ({ connectionId: "c", status: "ready" }),
    getAccounts: async () => [{ providerAccountId: "external", name: "Revolut", currency: "GBP" }],
    getTransactions: async () => [
      { providerTransactionId: "t1", providerAccountId: "external", merchantName: "Tesco", description: "TESCO", amount: -10, currency: "GBP", transactionDate: "2026-08-20T00:00:00.000Z", pending: false },
      { providerTransactionId: "t2", providerAccountId: "external", merchantName: "Lidl", description: "LIDL", amount: -20, currency: "GBP", transactionDate: "2026-08-20T00:00:00.000Z", pending: false }
    ]
  };
  const gbpAccount = { ...account("a1", "u1", "external"), provider: "truelayer", currency: "GBP" };
  const range = { from: new Date("2026-08-01"), to: new Date("2026-08-31") };

  it("écrit le montant converti, son taux et sa date sur chaque transaction", async () => {
    const repository = new InMemoryTransactionRepository([gbpAccount]);
    // Le vrai convertisseur arrondit au centime, à l'écart de zéro : la doublure fait de même,
    // sinon le test validerait un comportement que la production n'a pas.
    const round2 = (v: number) => (Math.sign(v) * Math.round(Math.abs(v) * 100)) / 100;
    const convert = async (requests: Array<{ amount: number }>) => requests.map((r) => ({ amountBase: round2(r.amount * 1.1665), baseCurrency: "EUR", fxRate: 1.1665, fxRateDate: "2026-08-20" }));
    const summary = await syncTransactions("u1", "c", gbpProvider, repository, range, undefined, convert as never);
    expect(summary.converted).toBe(2);
    expect(summary.unconverted).toBe(0);
    const stored = repository.all();
    expect(stored[0]).toMatchObject({ baseCurrency: "EUR", fxRate: 1.1665, fxRateDate: "2026-08-20" });
    expect(stored.map((t) => t.amountBase)).toEqual([-11.67, -23.33]);
  });

  it("importe quand même les transactions si le taux est indisponible", async () => {
    // Sans cela, une panne de l'API de taux ferait perdre l'import entier.
    const repository = new InMemoryTransactionRepository([gbpAccount]);
    const convert = async () => { throw new Error("Taux de change indisponible (503)."); };
    const summary = await syncTransactions("u1", "c", gbpProvider, repository, range, undefined, convert as never);
    expect(summary.added).toBe(2);
    expect(summary.errors).toHaveLength(0);
    expect(summary.conversionError).toContain("503");
    expect(summary.unconverted).toBe(2);
    expect(repository.all()[0]!.amountBase).toBeUndefined();
  });

  it("signale les transactions restées sans taux sans faire échouer les autres", async () => {
    const repository = new InMemoryTransactionRepository([gbpAccount]);
    const convert = async (requests: Array<{ amount: number }>) => requests.map((r, i) =>
      i === 0 ? { amountBase: r.amount * 1.1665, baseCurrency: "EUR", fxRate: 1.1665, fxRateDate: "2026-08-20" }
              : { amountBase: null, baseCurrency: "EUR", fxRate: null, fxRateDate: null, error: "Taux indisponible" });
    const summary = await syncTransactions("u1", "c", gbpProvider, repository, range, undefined, convert as never);
    expect(summary.converted).toBe(1);
    expect(summary.unconverted).toBe(1);
    expect(summary.conversionError).toBe("Taux indisponible");
    expect(summary.added).toBe(2);
  });

  it("fonctionne sans convertisseur, comme avant", async () => {
    const repository = new InMemoryTransactionRepository([gbpAccount]);
    const summary = await syncTransactions("u1", "c", gbpProvider, repository, range);
    expect(summary.added).toBe(2);
    expect(summary.converted).toBe(0);
    expect(summary.conversionError).toBeUndefined();
  });
});

describe("classification fournie par la banque", () => {
  it("conserve la classification et écarte toujours le reste du payload", async () => {
    const repository = new InMemoryTransactionRepository([{ ...account("a1", "u1", "external"), provider: "truelayer", currency: "EUR" }]);
    const provider: BankProvider = {
      name: "truelayer",
      connect: async () => ({ connectionId: "c", status: "ready" }),
      getAccounts: async () => [{ providerAccountId: "external", name: "Revolut", currency: "EUR" }],
      getTransactions: async () => [{
        providerTransactionId: "t1", providerAccountId: "external", merchantName: "Boulangerie", description: "BOULANGERIE",
        amount: -3.2, currency: "EUR", transactionDate: "2026-09-01T00:00:00.000Z", pending: false,
        rawData: { source: "truelayer", safeReference: "ref", providerClassification: "Food & Dining > Restaurants", iban: "FR7630006000011234567890189", balanceAfter: 129.88 }
      }]
    };
    await syncTransactions("u1", "c", provider, repository, { from: new Date("2026-09-01"), to: new Date("2026-09-30") });
    const stored = repository.all()[0]!;
    expect(stored.rawData).toEqual({ source: "truelayer", safeReference: "ref", providerClassification: "Food & Dining > Restaurants" });
    // La liste blanche reste la protection : rien d'autre ne passe, jamais.
    expect(stored.rawData).not.toHaveProperty("iban");
    expect(stored.rawData).not.toHaveProperty("balanceAfter");
  });
});
