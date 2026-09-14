import type { BankAccount, BankBalance } from "@/types/banking";
import type { Account, MerchantRule, StoredTransaction } from "@/types/database";
import { normalizeMerchant } from "@/lib/rules/categorize";

export interface TransactionRepository {
  upsertAccounts(userId: string, provider: string, accounts: BankAccount[]): Promise<Account[]>;
  updateAccountBalances(userId: string, provider: string, balances: BankBalance[]): Promise<number>;
  findAccounts(userId: string): Promise<Account[]>;
  findMerchantRules(userId: string): Promise<MerchantRule[]>;
  findMatchingTransactions(transactions: StoredTransaction[]): Promise<StoredTransaction[]>;
  saveAiMerchantRules(rules: MerchantRule[]): Promise<void>;
  upsertManualMerchantRule(rule: MerchantRule): Promise<void>;
  getUncategorizedTransactions(userId: string, limit?: number): Promise<StoredTransaction[]>;
  markCategorizationAttempted?(userId: string, transactionIds: string[]): Promise<void>;
  getUncategorizedTransactionsForProvider(userId: string, provider: string, limit?: number): Promise<StoredTransaction[]>;
  countUncategorized(userId: string): Promise<number>;
  countUncategorizedForProvider(userId: string, provider: string): Promise<number>;
  updateMerchantClassification(userId: string, normalizedMerchant: string, category: string, subcategory: string): Promise<number>;
  resetMerchantClassification(userId: string, normalizedMerchant: string): Promise<number>;
  deleteAiMerchantRule(userId: string, normalizedMerchant: string): Promise<boolean>;
  insertIfAbsent(transaction: StoredTransaction): Promise<"inserted" | "updated" | "duplicate">;
  upsertTransactions(transactions: StoredTransaction[]): Promise<BatchUpsertResult>;
  getTransactions(userId: string): Promise<StoredTransaction[]>;
  getTransactionsForProvider(userId: string, provider: string, limit?: number): Promise<StoredTransaction[]>;
  getTransactionsByDateRange(userId: string, from: Date, to: Date): Promise<StoredTransaction[]>;
  getTransactionsByCategory(userId: string, category: string): Promise<StoredTransaction[]>;
  getRecentTransactions(userId: string, limit?: number): Promise<StoredTransaction[]>;
}

export interface BatchUpsertResult {
  inserted: number;
  updated: number;
  duplicate: number;
  batches: number;
  upsertCalls: number;
}

export class InMemoryTransactionRepository implements TransactionRepository {
  constructor(
    private readonly accounts: Account[],
    private readonly rules: MerchantRule[] = [],
    private readonly transactions: StoredTransaction[] = []
  ) {}

  async upsertAccounts(userId: string, provider: string, bankAccounts: BankAccount[]) {
    for (const item of bankAccounts) {
      const existing = this.accounts.find((account) => account.userId === userId && account.provider === provider && account.providerAccountId === item.providerAccountId);
      if (existing) Object.assign(existing, { name: item.name, currency: item.currency });
      else this.accounts.push({ id: `${provider}_${item.providerAccountId}_${userId}`, userId, provider, providerAccountId: item.providerAccountId, name: item.name, currency: item.currency, balanceCurrent: null, balanceAvailable: null, balanceOverdraft: null, balanceUpdatedAt: null, createdAt: new Date().toISOString() });
    }
    return this.accounts.filter((item) => item.userId === userId && item.provider === provider);
  }
  async updateAccountBalances(userId: string, provider: string, balances: BankBalance[]) {
    let updated = 0;
    for (const balance of balances) {
      const account = this.accounts.find((item) => item.userId === userId && item.provider === provider && item.providerAccountId === balance.providerAccountId);
      if (!account) continue;
      Object.assign(account, { balanceCurrent: balance.current, balanceAvailable: balance.available ?? null, balanceOverdraft: balance.overdraft ?? null, balanceUpdatedAt: balance.updatedAt ?? new Date().toISOString() });
      updated++;
    }
    return updated;
  }
  async findAccounts(userId: string) { return this.accounts.filter((item) => item.userId === userId); }
  async findMerchantRules(userId: string) { return this.rules.filter((item) => item.userId === userId); }
  async findMatchingTransactions(transactions: StoredTransaction[]) {
    const keys = new Set(transactions.map(transactionKey));
    return this.transactions.filter((item) => keys.has(transactionKey(item)));
  }
  async saveAiMerchantRules(rules: MerchantRule[]) {
    for (const rule of rules) if (!this.rules.some((item) => item.userId === rule.userId && (item.normalizedMerchant || item.merchantPattern) === rule.normalizedMerchant)) this.rules.push({ ...rule });
  }
  async upsertManualMerchantRule(rule: MerchantRule) {
    const existing = this.rules.find((item) => item.userId === rule.userId && (item.normalizedMerchant || item.merchantPattern) === rule.normalizedMerchant);
    if (existing) Object.assign(existing, rule, { source: "manual", confidence: 1 });
    else this.rules.push({ ...rule, source: "manual", confidence: 1 });
  }
  async getUncategorizedTransactions(userId: string, limit = 1000) { return this.transactions.filter((item) => item.userId === userId && item.category === "Uncategorized").slice(0, limit); }
  async getUncategorizedTransactionsForProvider(userId: string, provider: string, limit = 1000) {
    const accountIds = new Set(this.accounts.filter((account) => account.userId === userId && account.provider === provider).map((account) => account.id));
    return this.transactions.filter((item) => item.userId === userId && accountIds.has(item.accountId) && item.category === "Uncategorized").slice(0, limit);
  }
  async countUncategorized(userId: string) { return this.transactions.filter((item) => item.userId === userId && item.category === "Uncategorized").length; }
  async countUncategorizedForProvider(userId: string, provider: string) {
    return (await this.getUncategorizedTransactionsForProvider(userId, provider, Number.MAX_SAFE_INTEGER)).length;
  }
  async updateMerchantClassification(userId: string, normalizedMerchant: string, category: string, subcategory: string) {
    const matched = this.transactions.filter((item) => item.userId === userId && normalizeMerchant(item.merchantName || item.description) === normalizedMerchant);
    matched.forEach((item) => Object.assign(item, { category, subcategory, categorySource: "manual", categoryConfidence: 1, categorizedAt: new Date().toISOString() }));
    return matched.length;
  }
  async resetMerchantClassification(userId: string, normalizedMerchant: string) {
    const matched = this.transactions.filter((item) => item.userId === userId && normalizeMerchant(item.merchantName || item.description) === normalizedMerchant);
    matched.forEach((item) => Object.assign(item, { category: "Uncategorized", subcategory: "Other", categorySource: "uncategorized", categoryConfidence: null, categorizedAt: null }));
    return matched.length;
  }
  async deleteAiMerchantRule(userId: string, normalizedMerchant: string) {
    const index = this.rules.findIndex((item) => item.userId === userId && item.source === "ai" && (item.normalizedMerchant || normalizeMerchant(item.merchantPattern)) === normalizedMerchant);
    if (index < 0) return false;
    this.rules.splice(index, 1);
    return true;
  }
  async insertIfAbsent(transaction: StoredTransaction): Promise<"inserted" | "updated" | "duplicate"> {
    const existing = this.transactions.find((item) => item.userId === transaction.userId && item.accountId === transaction.accountId && item.providerTransactionId === transaction.providerTransactionId);
    if (existing) {
      const changed = existing.pending !== transaction.pending || existing.amount !== transaction.amount || existing.transactionDate !== transaction.transactionDate || existing.description !== transaction.description || existing.category !== transaction.category || existing.subcategory !== transaction.subcategory || existing.categorySource !== transaction.categorySource || existing.categoryConfidence !== transaction.categoryConfidence;
      if (!changed) return "duplicate";
      Object.assign(existing, transaction);
      return "updated";
    }
    this.transactions.push({ ...transaction });
    return "inserted";
  }
  async upsertTransactions(transactions: StoredTransaction[]): Promise<BatchUpsertResult> {
    const result: BatchUpsertResult = { inserted: 0, updated: 0, duplicate: 0, batches: transactions.length ? 1 : 0, upsertCalls: transactions.length ? 1 : 0 };
    for (const transaction of transactions) result[await this.insertIfAbsent(transaction)]++;
    return result;
  }
  async getTransactions(userId: string) { return this.transactions.filter((item) => item.userId === userId); }
  async getTransactionsForProvider(userId: string, provider: string, limit = 5000) {
    const accountIds = new Set(this.accounts.filter((account) => account.userId === userId && account.provider === provider).map((account) => account.id));
    return this.transactions.filter((item) => item.userId === userId && accountIds.has(item.accountId)).slice(0, limit);
  }
  async getTransactionsByDateRange(userId: string, from: Date, to: Date) { return (await this.getTransactions(userId)).filter((item) => new Date(item.transactionDate) >= from && new Date(item.transactionDate) <= to); }
  async getTransactionsByCategory(userId: string, category: string) { return (await this.getTransactions(userId)).filter((item) => item.category === category); }
  async getRecentTransactions(userId: string, limit = 10) { return (await this.getTransactions(userId)).sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)).slice(0, limit); }
  all() { return [...this.transactions]; }
}

function transactionKey(transaction: Pick<StoredTransaction, "userId" | "accountId" | "providerTransactionId">) { return `${transaction.userId}\u0000${transaction.accountId}\u0000${transaction.providerTransactionId}`; }
