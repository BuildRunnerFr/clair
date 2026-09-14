import type { BankProvider } from "./bank-provider";
import type { BankAccount, BankConnectionResult, BankTransaction } from "@/types/banking";

const MOCK_TRANSACTIONS: BankTransaction[] = [
  ["tx_001", "mock_eur", "Carrefour", "CARREFOUR MARKET", -68.42, "EUR", "2026-08-22", false],
  ["tx_002", "mock_myr", "Grab", "GRAB *RIDE", -24.8, "MYR", "2026-08-21", false],
  ["tx_003", "mock_myr", "Starbucks", "STARBUCKS KLCC", -18.5, "MYR", "2026-08-20", false],
  ["tx_004", "mock_eur", "Netflix", "NETFLIX.COM", -17.99, "EUR", "2026-08-18", false],
  ["tx_005", "mock_myr", "Village Park", "VILLAGE PARK RESTAURANT", -42.3, "MYR", "2026-08-17", false],
  ["tx_006", "mock_eur", "Spotify", "SPOTIFY AB", -10.99, "EUR", "2026-08-15", false],
  ["tx_007", "mock_myr", "Shopee", "SHOPEE MALAYSIA", -129.9, "MYR", "2026-08-12", false],
  ["tx_008", "mock_myr", "AirAsia", "AIRASIA KUL-BKK", -488, "MYR", "2026-08-10", false],
  ["tx_009", "mock_eur", "Loyer", "VIREMENT LOYER", -920, "EUR", "2026-08-02", false],
  ["tx_010", "mock_myr", "Jaya Grocer", "JAYA GROCER", -156.7, "MYR", "2026-08-05", false],
  ["tx_011", "mock_myr", "Grab", "GRAB *RIDE", -31.2, "MYR", "2026-07-26", false],
  ["tx_012", "mock_eur", "Carrefour", "CARREFOUR MARKET", -75.1, "EUR", "2026-07-19", false],
  ["tx_013", "mock_eur", "Loyer", "VIREMENT LOYER", -920, "EUR", "2026-07-02", false],
  ["tx_014", "mock_myr", "Uniqlo", "UNIQLO PAVILION", -219.9, "MYR", "2026-07-12", false],
  ["tx_015", "mock_myr", "Salaire", "SALARY CREDIT", 8500, "MYR", "2026-08-01", false]
].map(([providerTransactionId, providerAccountId, merchantName, description, amount, currency, transactionDate, pending]) => ({
  providerTransactionId: String(providerTransactionId),
  providerAccountId: String(providerAccountId),
  merchantName: String(merchantName),
  description: String(description),
  amount: Number(amount),
  currency: String(currency),
  transactionDate: `${transactionDate}T12:00:00.000Z`,
  pending: Boolean(pending),
  rawData: { source: "mock", safeReference: providerTransactionId }
}));

export class MockBankProvider implements BankProvider {
  readonly name = "mock";

  async connect(userId: string): Promise<BankConnectionResult> {
    return { connectionId: `mock_${userId}`, status: "ready" };
  }

  async getAccounts(_connectionId: string): Promise<BankAccount[]> {
    return [
      { providerAccountId: "mock_eur", name: "Compte courant EUR", currency: "EUR" },
      { providerAccountId: "mock_myr", name: "Compte courant MYR", currency: "MYR" }
    ];
  }

  async getTransactions(_connectionId: string, from: Date, to: Date): Promise<BankTransaction[]> {
    return MOCK_TRANSACTIONS.filter((transaction) => {
      const date = new Date(transaction.transactionDate);
      return date >= from && date <= to;
    }).map((transaction) => ({ ...transaction, rawData: { ...transaction.rawData } }));
  }
}
