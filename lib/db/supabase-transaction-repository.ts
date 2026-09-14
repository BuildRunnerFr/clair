import { transactionTotals } from "@/lib/transactions/amounts";
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BankAccount, BankBalance } from "@/types/banking";
import type { Account, MerchantRule, StoredTransaction } from "@/types/database";
import type { Database, Json } from "@/types/supabase";
import type { BatchUpsertResult, TransactionRepository } from "./transaction-repository";
import { normalizeMerchant } from "@/lib/rules/categorize";
import { buildSearchFilter } from "./search-filter";

const TRANSACTION_BATCH_SIZE = 200;

export class SupabaseTransactionRepository implements TransactionRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async upsertAccounts(userId: string, provider: string, accounts: BankAccount[]): Promise<Account[]> {
    if (accounts.length) {
      const { error } = await this.client.from("accounts").upsert(accounts.map((account) => ({
        user_id: userId, provider, provider_account_id: account.providerAccountId, name: account.name, currency: account.currency
      })), { onConflict: "user_id,provider,provider_account_id" });
      if (error) throw new Error(`Échec de l’enregistrement des comptes: ${error.message}`);
    }
    const { data, error } = await this.client.from("accounts").select("*").eq("user_id", userId).eq("provider", provider).order("created_at");
    if (error) throw new Error(`Échec de lecture des comptes synchronisés: ${error.message}`);
    return data.map(mapAccount);
  }

  async updateAccountBalances(userId: string, provider: string, balances: BankBalance[]): Promise<number> {
    let updated = 0;
    for (const balance of balances) {
      const { data, error } = await this.client.from("accounts").update({
        balance_current: balance.current,
        balance_available: balance.available ?? null,
        balance_overdraft: balance.overdraft ?? null,
        balance_updated_at: balance.updatedAt ?? new Date().toISOString()
      }).eq("user_id", userId).eq("provider", provider).eq("provider_account_id", balance.providerAccountId).select("id");
      if (error) throw new Error(`Échec de l’enregistrement du solde: ${error.message}`);
      updated += data?.length ?? 0;
      // Feeds the accurate history layer: one row per account and per day, so a second sync
      // the same day refreshes the point instead of adding a duplicate one.
      const accountId = data?.[0]?.id;
      if (accountId) {
        const { error: snapshotError } = await this.client.from("account_balance_snapshots").upsert({
          user_id: userId,
          account_id: accountId,
          currency: balance.currency,
          balance_current: balance.current,
          balance_available: balance.available ?? null,
          balance_overdraft: balance.overdraft ?? null,
          captured_at: new Date().toISOString()
        }, { onConflict: "account_id,captured_on" });
        if (snapshotError) throw new Error(`Échec de l’enregistrement de l’instantané de solde: ${snapshotError.message}`);
      }
    }
    return updated;
  }

  async findAccounts(userId: string): Promise<Account[]> {
    const { data, error } = await this.client.from("accounts").select("*").eq("user_id", userId).order("created_at");
    if (error) throw new Error(`Échec de lecture des comptes: ${error.message}`);
    return data.map(mapAccount);
  }

  async findMerchantRules(userId: string): Promise<MerchantRule[]> {
    const { data, error } = await this.client.from("merchant_rules").select("id,user_id,merchant_pattern,normalized_merchant,category,subcategory,source,confidence,created_at,updated_at").eq("user_id", userId).order("updated_at", { ascending: false });
    if (error) throw new Error(`Échec de lecture des règles: ${error.message}`);
    return data.map((row) => ({ id: row.id, userId: row.user_id, merchantPattern: row.merchant_pattern, normalizedMerchant: row.normalized_merchant, category: row.category, subcategory: row.subcategory, source: row.source as "manual" | "ai" | "default", confidence: row.confidence === null ? null : Number(row.confidence), createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  async findMatchingTransactions(transactions: StoredTransaction[]): Promise<StoredTransaction[]> {
    const found: StoredTransaction[] = [];
    for (const batch of chunks(transactions, TRANSACTION_BATCH_SIZE)) {
      if (!batch.length) continue;
      const { data, error } = await this.client.from("transactions").select("*").eq("user_id", batch[0]!.userId).in("account_id", [...new Set(batch.map((item) => item.accountId))]).in("provider_transaction_id", [...new Set(batch.map((item) => item.providerTransactionId))]);
      if (error) throw new Error(`Échec de déduplication des transactions: ${error.message}`);
      const keys = new Set(batch.map(transactionKey));
      found.push(...data.filter((row) => keys.has(`${row.account_id}\u0000${row.provider_transaction_id}`)).map(mapTransaction));
    }
    return found;
  }

  async saveAiMerchantRules(rules: MerchantRule[]): Promise<void> {
    if (!rules.length) return;
    const { error } = await this.client.from("merchant_rules").upsert(rules.map((rule) => ({ user_id: rule.userId, merchant_pattern: rule.merchantPattern, normalized_merchant: rule.normalizedMerchant ?? normalizeMerchant(rule.merchantPattern), category: rule.category, subcategory: rule.subcategory, source: "ai", confidence: rule.confidence ?? null })), { onConflict: "user_id,normalized_merchant", ignoreDuplicates: true });
    if (error) throw new Error(`Échec de mémorisation des règles IA: ${error.message}`);
  }

  async upsertManualMerchantRule(rule: MerchantRule): Promise<void> {
    const normalized = rule.normalizedMerchant ?? normalizeMerchant(rule.merchantPattern);
    const { error } = await this.client.from("merchant_rules").upsert({ user_id: rule.userId, merchant_pattern: normalized, normalized_merchant: normalized, category: rule.category, subcategory: rule.subcategory, source: "manual", confidence: 1 }, { onConflict: "user_id,normalized_merchant" });
    if (error) throw new Error(`Échec d’enregistrement de la règle manuelle: ${error.message}`);
  }

  /**
   * Jamais tentées d'abord, puis les plus anciennement tentées.
   *
   * L'ordre précédent était celui des transactions les plus récentes, et il était stable : un
   * marchand que l'IA ne sait pas classer restait non catégorisé, donc restait en tête, donc
   * repassait à chaque fois — en occupant une place que personne d'autre n'obtenait jamais. La
   * file n'avançait pas, elle piétinait.
   */
  async getUncategorizedTransactions(userId: string, limit = 1000): Promise<StoredTransaction[]> {
    const { data, error } = await this.client.from("transactions").select("*").eq("user_id", userId).eq("category", "Uncategorized")
      .order("categorization_attempted_at", { ascending: true, nullsFirst: true })
      .order("transaction_date", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Échec de lecture des transactions non catégorisées: ${error.message}`);
    return data.map(mapTransaction);
  }

  /**
   * Consigne qu'on a essayé, quel qu'ait été le résultat.
   *
   * Sans conséquence en cas d'échec : rater cette écriture fait repasser les mêmes marchands à
   * la ronde suivante, ce qui est exactement l'état d'avant. Elle ne doit pas faire échouer une
   * catégorisation par ailleurs réussie.
   */
  async markCategorizationAttempted(userId: string, transactionIds: string[]): Promise<void> {
    if (!transactionIds.length) return;
    for (let index = 0; index < transactionIds.length; index += 500) {
      const { error } = await this.client.from("transactions")
        .update({ categorization_attempted_at: new Date().toISOString() })
        .eq("user_id", userId).in("id", transactionIds.slice(index, index + 500));
      if (error) { console.warn("[categorisation] tentative non consignée", { message: error.message }); return; }
    }
  }

  async getUncategorizedTransactionsForProvider(userId: string, provider: string, limit = 1000): Promise<StoredTransaction[]> {
    const { data: accounts, error: accountsError } = await this.client.from("accounts").select("id").eq("user_id", userId).eq("provider", provider);
    if (accountsError) throw new Error(`Échec de lecture des comptes du fournisseur: ${accountsError.message}`);
    const accountIds = accounts.map((account) => account.id);
    if (!accountIds.length) return [];
    const rows = await this.readTransactionPages((from, to) => this.client.from("transactions").select("*").eq("user_id", userId).in("account_id", accountIds).eq("category", "Uncategorized").order("transaction_date", { ascending: false }).range(from, to), limit);
    return rows.map(mapTransaction);
  }

  async countUncategorized(userId: string): Promise<number> {
    const { count, error } = await this.client.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("category", "Uncategorized");
    if (error) throw new Error(`Échec du comptage des transactions non catégorisées: ${error.message}`);
    return count ?? 0;
  }

  async countUncategorizedForProvider(userId: string, provider: string): Promise<number> {
    const { data: accounts, error: accountsError } = await this.client.from("accounts").select("id").eq("user_id", userId).eq("provider", provider);
    if (accountsError) throw new Error(`Échec de lecture des comptes du fournisseur: ${accountsError.message}`);
    const accountIds = accounts.map((account) => account.id);
    if (!accountIds.length) return 0;
    const { count, error } = await this.client.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId).in("account_id", accountIds).eq("category", "Uncategorized");
    if (error) throw new Error(`Échec du comptage des transactions non catégorisées: ${error.message}`);
    return count ?? 0;
  }

  async updateMerchantClassification(userId: string, normalizedMerchant: string, category: string, subcategory: string): Promise<number> {
    const ids = await this.findMerchantTransactionIds(userId, normalizedMerchant);
    for (const batch of chunks(ids, TRANSACTION_BATCH_SIZE)) {
      const { error: updateError } = await this.client.from("transactions").update({ category, subcategory, category_source: "manual", category_confidence: 1, categorized_at: new Date().toISOString() }).eq("user_id", userId).in("id", batch);
      if (updateError) throw new Error(`Échec de correction des transactions: ${updateError.message}`);
    }
    return ids.length;
  }

  async updateTransactionClassification(userId: string, id: string, category: string, subcategory: string): Promise<number> {
    const { data, error } = await this.client.from("transactions")
      .update({ category, subcategory, category_source: "manual", category_confidence: 1, categorized_at: new Date().toISOString() })
      .eq("user_id", userId).eq("id", id).select("id");
    if (error) throw new Error("Échec de correction de l’opération.");
    return data?.length ?? 0;
  }

  async resetMerchantClassification(userId: string, normalizedMerchant: string): Promise<number> {
    const ids = await this.findMerchantTransactionIds(userId, normalizedMerchant);
    for (const batch of chunks(ids, TRANSACTION_BATCH_SIZE)) {
      const { error } = await this.client.from("transactions").update({ category: "Uncategorized", subcategory: "Other", category_source: "uncategorized", category_confidence: null, categorized_at: null }).eq("user_id", userId).in("id", batch);
      if (error) throw new Error(`Échec de remise en Uncategorized: ${error.message}`);
    }
    return ids.length;
  }

  async deleteAiMerchantRule(userId: string, normalizedMerchant: string): Promise<boolean> {
    const { data, error } = await this.client.from("merchant_rules").delete().eq("user_id", userId).eq("normalized_merchant", normalizedMerchant).eq("source", "ai").select("id");
    if (error) throw new Error(`Échec de suppression de la règle IA: ${error.message}`);
    return (data?.length ?? 0) > 0;
  }

  async insertIfAbsent(transaction: StoredTransaction): Promise<"inserted" | "updated" | "duplicate"> {
    const { data: existing, error: readError } = await this.client.from("transactions").select("pending,amount,transaction_date,description").eq("user_id", transaction.userId).eq("account_id", transaction.accountId).eq("provider_transaction_id", transaction.providerTransactionId).maybeSingle();
    if (readError) throw new Error(`Échec de vérification de transaction: ${readError.message}`);
    if (existing && existing.pending === transaction.pending && Number(existing.amount) === transaction.amount && existing.transaction_date === transaction.transactionDate && existing.description === transaction.description) return "duplicate";
    const { error } = await this.client.from("transactions").upsert(toInsert(transaction), {
      onConflict: "user_id,account_id,provider_transaction_id"
    });
    if (error) throw new Error(`Échec d’insertion de transaction: ${error.message}`);
    return existing ? "updated" : "inserted";
  }

  async upsertTransactions(transactions: StoredTransaction[]): Promise<BatchUpsertResult> {
    const result: BatchUpsertResult = { inserted: 0, updated: 0, duplicate: 0, batches: 0, upsertCalls: 0 };
    for (const batch of chunks(transactions, TRANSACTION_BATCH_SIZE)) {
      const accountIds = [...new Set(batch.map((item) => item.accountId))];
      const providerIds = [...new Set(batch.map((item) => item.providerTransactionId))];
      const { data: rows, error: readError } = await this.client.from("transactions")
        .select("account_id,provider_transaction_id,pending,amount,transaction_date,description,category,subcategory,category_source,category_confidence,categorized_at,amount_base,raw_data")
        .eq("user_id", batch[0]!.userId)
        .in("account_id", accountIds)
        .in("provider_transaction_id", providerIds);
      if (readError) throw new Error(`Échec de vérification des transactions: ${readError.message}`);
      const existing = new Map((rows ?? []).map((row) => [`${row.account_id}\u0000${row.provider_transaction_id}`, row]));
      const changed: StoredTransaction[] = [];
      for (const transaction of batch) {
        const row = existing.get(transactionKey(transaction));
        if (!row) { result.inserted++; changed.push(transaction); continue; }
        // Une ligne à qui il manque la conversion, ou la classification que la banque fournit
        // désormais, doit être réécrite : sans cela elle serait tenue pour un doublon et ne
        // recevrait jamais l'information.
        const missingClassification = Boolean((transaction.rawData as { providerClassification?: string } | undefined)?.providerClassification) && !(row.raw_data as { providerClassification?: string } | null)?.providerClassification;
        if (!missingClassification && row.amount_base !== null && row.pending === transaction.pending && Number(row.amount) === transaction.amount && row.transaction_date === transaction.transactionDate && row.description === transaction.description && row.category === transaction.category && row.subcategory === transaction.subcategory && row.category_source === (transaction.categorySource ?? null) && nullableNumber(row.category_confidence) === (transaction.categoryConfidence ?? null)) result.duplicate++;
        else { result.updated++; changed.push(transaction); }
      }
      if (changed.length) {
        const { error } = await this.client.from("transactions").upsert(changed.map(toInsert), { onConflict: "user_id,account_id,provider_transaction_id" });
        if (error) throw new Error(`Échec d’écriture des transactions: ${error.message}`);
        result.upsertCalls++;
      }
      result.batches++;
    }
    return result;
  }

  /**
   * Recherche paginée sur les transactions.
   *
   * Requête directe sur la table plutôt qu'une RPC : il n'y a ici aucune agrégation à faire en
   * base, et le RLS filtre déjà sur l'utilisateur. Le motif est échappé avant d'être injecté
   * dans un ilike — sans quoi un « % » saisi par l'utilisateur deviendrait un joker et un
   * « , » couperait le filtre en deux côté PostgREST.
   */
  /** Total de la sélection complète, indépendamment de la pagination d’affichage. */
  async searchTotals(userId: string, options: { query?: string; category?: string; account?: string; status?: "booked" | "pending"; from?: string; to?: string }) {
    const rows = await this.readTransactionPages((from, to) => {
      let request = this.client.from("transactions").select("id,amount,currency,amount_base,base_currency,pending")
        .eq("user_id", userId);
      if (options.category) request = request.eq("category", options.category);
      if (options.account) request = request.eq("account_id", options.account);
      if (options.status) request = request.eq("pending", options.status === "pending");
      if (options.from) request = request.gte("transaction_date", options.from);
      if (options.to) request = request.lt("transaction_date", options.to);
      const searchFilter = options.query ? buildSearchFilter(options.query, ["merchant_name", "description"]) : null;
      if (searchFilter) request = request.or(searchFilter);
      return request.order("id").range(from, to);
    }, Number.MAX_SAFE_INTEGER);
    return transactionTotals(rows.map(row => ({ amount: Number(row.amount), currency: row.currency,
      amountBase: row.amount_base === null ? null : Number(row.amount_base), baseCurrency: row.base_currency, pending: row.pending })));
  }

  async searchTransactions(userId: string, options: { query?: string; category?: string; account?: string; status?: "booked" | "pending"; from?: string; to?: string; limit?: number; offset?: number }) {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    let request = this.client.from("transactions").select("*", { count: "exact" }).eq("user_id", userId);
    if (options.category) request = request.eq("category", options.category);
    if (options.account) request = request.eq("account_id", options.account);
    if (options.status) request = request.eq("pending", options.status === "pending");
    if (options.from) request = request.gte("transaction_date", options.from);
    if (options.to) request = request.lt("transaction_date", options.to);
    const searchFilter = options.query ? buildSearchFilter(options.query, ["merchant_name", "description"]) : null;
    if (searchFilter) request = request.or(searchFilter);
    const { data, error, count } = await request.order("transaction_date", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw new Error(`Échec de la recherche: ${error.message}`);
    return { transactions: data.map(mapTransaction), total: count ?? 0, limit, offset };
  }

  /**
   * La date de la plus ancienne opération connue, ou null si aucune.
   *
   * Sert à décider si une synchronisation doit rattraper de l'historique : une connexion établie
   * quand la fenêtre était plus courte reste sinon amputée pour toujours, puisque les
   * synchronisations suivantes ne repartent que du dernier passage.
   */
  async getOldestTransactionDate(userId: string): Promise<Date | null> {
    const { data, error } = await this.client
      .from("transactions")
      .select("transaction_date")
      .eq("user_id", userId)
      .order("transaction_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Échec de lecture de l’historique: ${error.message}`);
    return data ? new Date(data.transaction_date) : null;
  }

  async getTransactions(userId: string) {
    const rows = await this.readTransactionPages((from, to) => this.client.from("transactions")
      .select("*").eq("user_id", userId).order("transaction_date", { ascending: false })
      .order("id", { ascending: false }).range(from, to), Number.MAX_SAFE_INTEGER);
    return rows.map(mapTransaction);
  }

  async getTransactionsForProvider(userId: string, provider: string, limit = 5000): Promise<StoredTransaction[]> {
    const { data: accounts, error: accountsError } = await this.client.from("accounts").select("id").eq("user_id", userId).eq("provider", provider);
    if (accountsError) throw new Error(`Échec de lecture des comptes du fournisseur: ${accountsError.message}`);
    const accountIds = accounts.map((account) => account.id);
    if (!accountIds.length) return [];
    const rows = await this.readTransactionPages((from, to) => this.client.from("transactions").select("*").eq("user_id", userId).in("account_id", accountIds).order("transaction_date", { ascending: false }).range(from, to), limit);
    return rows.map(mapTransaction);
  }

  async getTransactionsByDateRange(userId: string, from: Date, to: Date) {
    const { data, error } = await this.client.from("transactions").select("*").eq("user_id", userId).gte("transaction_date", from.toISOString()).lte("transaction_date", to.toISOString()).order("transaction_date", { ascending: false });
    if (error) throw new Error(`Échec de lecture des transactions: ${error.message}`);
    return data.map(mapTransaction);
  }

  async getTransactionsByCategory(userId: string, category: string) {
    const { data, error } = await this.client.from("transactions").select("*").eq("user_id", userId).eq("category", category).order("transaction_date", { ascending: false });
    if (error) throw new Error(`Échec de lecture par catégorie: ${error.message}`);
    return data.map(mapTransaction);
  }

  async getRecentTransactions(userId: string, limit = 10) {
    const { data, error } = await this.client.from("transactions").select("*").eq("user_id", userId).order("transaction_date", { ascending: false }).limit(limit);
    if (error) throw new Error(`Échec de lecture des transactions récentes: ${error.message}`);
    return data.map(mapTransaction);
  }

  private async findMerchantTransactionIds(userId: string, normalizedMerchant: string) {
    const rows = await this.readTransactionPages((from, to) => this.client.from("transactions").select("id,merchant_name,description").eq("user_id", userId).range(from, to), 10_000);
    return rows.filter((row) => normalizeMerchant(row.merchant_name || row.description) === normalizedMerchant).map((row) => row.id);
  }

  private async readTransactionPages<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, limit: number): Promise<T[]> {
    const rows: T[] = [];
    const pageSize = Math.min(1000, limit);
    while (rows.length < limit) {
      const { data, error } = await query(rows.length, Math.min(rows.length + pageSize, limit) - 1);
      if (error) throw new Error(`Échec de lecture paginée des transactions: ${error.message}`);
      const page = data ?? [];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return rows;
  }
}

function transactionKey(transaction: Pick<StoredTransaction, "accountId" | "providerTransactionId">) {
  return `${transaction.accountId}\u0000${transaction.providerTransactionId}`;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function mapAccount(row: Database["public"]["Tables"]["accounts"]["Row"]): Account {
  return { id: row.id, userId: row.user_id, provider: row.provider, providerAccountId: row.provider_account_id, name: row.name, currency: row.currency, balanceCurrent: nullableNumber(row.balance_current), balanceAvailable: nullableNumber(row.balance_available), balanceOverdraft: nullableNumber(row.balance_overdraft), balanceUpdatedAt: row.balance_updated_at, createdAt: row.created_at };
}

function mapTransaction(row: Database["public"]["Tables"]["transactions"]["Row"]): StoredTransaction {
  return { id: row.id, userId: row.user_id, accountId: row.account_id, providerTransactionId: row.provider_transaction_id, merchantName: row.merchant_name, description: row.description, amount: Number(row.amount), currency: row.currency, transactionDate: row.transaction_date, category: row.category, subcategory: row.subcategory, categorySource: row.category_source as StoredTransaction["categorySource"], categoryConfidence: nullableNumber(row.category_confidence), categorizedAt: row.categorized_at, pending: row.pending, amountBase: nullableNumber(row.amount_base), baseCurrency: row.base_currency, fxRate: nullableNumber(row.fx_rate), fxRateDate: row.fx_rate_date, rawData: row.raw_data as Record<string, unknown> | undefined };
}

function toInsert(transaction: StoredTransaction): Database["public"]["Tables"]["transactions"]["Insert"] {
  return { user_id: transaction.userId, account_id: transaction.accountId, provider_transaction_id: transaction.providerTransactionId, merchant_name: transaction.merchantName, description: transaction.description, amount: transaction.amount, currency: transaction.currency, transaction_date: transaction.transactionDate, category: transaction.category, subcategory: transaction.subcategory, category_source: transaction.categorySource ?? null, category_confidence: transaction.categoryConfidence ?? null, categorized_at: transaction.categorizedAt ?? null, pending: transaction.pending, amount_base: transaction.amountBase ?? null, base_currency: transaction.baseCurrency ?? null, fx_rate: transaction.fxRate ?? null, fx_rate_date: transaction.fxRateDate ?? null, raw_data: transaction.rawData as Json | undefined };
}

function nullableNumber(value: number | null) { return value === null ? null : Number(value); }
