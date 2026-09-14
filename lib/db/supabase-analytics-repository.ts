import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SqlDashboardSummary } from "@/types/analytics";
import type { Budget, BudgetStatus, CategoryHistory } from "@/types/database";
import type { Database } from "@/types/supabase";
import { getUtcMonthBounds } from "@/lib/analytics/month";
import { typicalMonth } from "@/lib/analytics/typical-month";
import type { BudgetRepository } from "./budget-repository";

export class SupabaseAnalyticsRepository implements BudgetRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  /** Devise de restitution de l'utilisateur, telle que la base la détermine. */
  async getBaseCurrency(): Promise<string> {
    const { data, error } = await this.client.rpc("finance_base_currency");
    if (error) throw new Error(`Échec de lecture de la devise principale: ${error.message}`);
    return (data as string | null) ?? "EUR";
  }

  async getAvailableCurrencies(): Promise<string[]> {
    const { data, error } = await this.client.rpc("finance_available_currencies");
    if (error) throw new Error(`Échec de lecture des devises: ${error.message}`);
    return data.map((item) => item.currency);
  }

  /**
   * `originCurrency` restricts to transactions made in that currency; omitting it covers all
   * of them. Amounts always come back in the user's reporting currency, whatever the filter.
   */
  async getDashboard(month: string, originCurrency: string | null, accountId?: string, category?: string, recurringMerchants: string[] = [], selfNames: string[] = []): Promise<SqlDashboardSummary> {
    const bounds = getUtcMonthBounds(month);
    const common = { p_currency: originCurrency, p_account_id: accountId ?? null, p_category: category ?? null };
    // Fetched first because the balance series needs a concrete currency: account balances
    // are held in the account's own currency and are not converted, unlike spending.
    const { data: baseData, error: baseError } = await this.client.rpc("finance_base_currency");
    if (baseError) throw new Error(`Échec de lecture de la devise principale: ${baseError.message}`);
    const baseCurrency = (baseData as string | null) ?? originCurrency ?? "EUR";
    const [monthly, categories, budgets, merchants, recent, history, trend, toDate, flows, discretionary] = await Promise.all([
      this.client.rpc("finance_monthly_summary", { p_month: bounds.monthDate, ...common }),
      this.client.rpc("finance_spending_by_category", { p_from: bounds.from, p_to: bounds.to, ...common }),
      this.client.rpc("finance_budget_status", { p_month: bounds.monthDate, p_currency: null }),
      this.client.rpc("finance_top_merchants", { p_month: bounds.monthDate, ...common, p_limit: 5 }),
      this.client.rpc("finance_recent_transactions", { p_from: bounds.from, p_to: bounds.to, ...common, p_limit: 8 }),
      this.client.rpc("finance_balance_history", { p_from: bounds.from, p_to: balanceHistoryEnd(bounds.to), p_currency: originCurrency ?? baseCurrency, p_account_id: accountId ?? null }),
      this.client.rpc("finance_monthly_trend", { p_months: 6 }),
      // À date égale : comparer un mois entamé à des mois entiers ferait paraître exemplaire
      // tout début de mois. Pour un mois révolu, la coupure au 31 revient au mois entier.
      this.client.rpc("finance_month_to_date", { p_month: bounds.monthDate, p_day: dayCutFor(month), p_months: 6 }),
      // Les noms de l'utilisateur servent à reconnaître un virement vers un compte à lui qui
      // n'est pas connecté ici : « FROM M JEAN DUPONT » n'est pas un revenu.
      this.client.rpc("finance_month_flows", { p_month: bounds.monthDate, p_currency: originCurrency, p_account_id: accountId ?? null, p_self_names: selfNames }),
      // Les marchands récurrents sont retirés ici : ils forment les décrochements datés de la
      // prévision, et les compter aussi dans le rythme quotidien les compterait deux fois.
      this.client.rpc("finance_discretionary_by_day", { p_months: 12, p_currency: originCurrency, p_exclude: recurringMerchants })
    ]);
    const failure = [monthly, categories, budgets, merchants, recent, history, trend, toDate, flows, discretionary].find((result) => result.error);
    if (failure?.error) throw new Error(`Échec des analytics SQL: ${failure.error.message}`);
    const summary = monthly.data?.[0];
    const budgetStatus = (budgets.data ?? []).map(mapBudgetStatus);
    const configuredBudget = budgetStatus.reduce((total, item) => total + (item.monthlyLimit ?? 0), 0);
    const spentAgainstBudgets = budgetStatus.reduce((total, item) => total + (item.monthlyLimit === null ? 0 : item.spent), 0);
    return {
      baseCurrency,
      totalSpent: Number(summary?.total_spent ?? 0),
      pendingSpent: Number(summary?.pending_spent ?? 0),
      previousMonthSpent: Number(summary?.previous_month_spent ?? 0),
      changePercent: summary?.change_percent === null || summary?.change_percent === undefined ? null : Number(summary.change_percent),
      configuredBudget,
      budgetRemaining: configuredBudget - spentAgainstBudgets,
      byCategory: (categories.data ?? []).map((item) => ({ name: item.category, amount: Number(item.total_spent) })),
      budgetStatus,
      topMerchants: (merchants.data ?? []).map((item) => ({ name: item.merchant_name, amount: Number(item.total_spent) })),
      monthlyTrend: (trend.data ?? []).map((item) => ({ month: item.month.slice(0, 7), spent: Number(item.total_spent) })),
      typicalMonth: typicalMonth((toDate.data ?? []).map((item) => ({ month: item.month.slice(0, 7), total: Number(item.total) })), month),
      income: Number(flows.data?.[0]?.income ?? 0),
      outflow: Number(flows.data?.[0]?.outflow ?? 0),
      transfersExcluded: Number(flows.data?.[0]?.transfers_excluded ?? 0),
      dailyDiscretionary: (discretionary.data ?? []).map((item) => ({ month: item.month, day: Number(item.day), total: Number(item.total) })),
      balanceHistory: (history.data ?? []).map((item) => ({ day: item.day, balance: Number(item.balance), reconstructed: item.reconstructed })),
      latest: (recent.data ?? []).map((item) => ({ id: item.id, providerTransactionId: item.provider_transaction_id, merchantName: item.merchant_name, description: item.description, amount: Number(item.amount), currency: item.currency, amountBase: item.amount_base === null ? null : Number(item.amount_base), baseCurrency: item.base_currency, transactionDate: item.transaction_date, category: item.category, subcategory: item.subcategory, pending: item.pending }))
    };
  }

  async getUnconvertedSpendingCount(userId: string, month: string): Promise<number> {
    const bounds = getUtcMonthBounds(month);
    const { count, error } = await this.client.from("transactions").select("id", { count: "exact", head: true })
      .eq("user_id", userId).lt("amount", 0).eq("pending", false).is("amount_base", null)
      .gte("transaction_date", bounds.from).lt("transaction_date", bounds.to);
    if (error) throw new Error("Échec de vérification des conversions manquantes.");
    return count ?? 0;
  }

  async getBudgetStatus(month: string, currency: string | null): Promise<BudgetStatus[]> {
    const { data, error } = await this.client.rpc("finance_budget_status", { p_month: getUtcMonthBounds(month).monthDate, p_currency: currency });
    if (error) throw new Error(`Échec de lecture des budgets: ${error.message}`);
    return data.map(mapBudgetStatus);
  }

  /** Dépense mensuelle moyenne par catégorie sur les mois révolus, pour situer une limite. */
  async getCategoryHistory(months = 6): Promise<CategoryHistory[]> {
    const { data, error } = await this.client.rpc("finance_category_history", { p_months: months });
    if (error) throw new Error(`Échec de lecture de l’historique par catégorie: ${error.message}`);
    return (data ?? []).map((item) => ({ category: item.category, averageMonthly: Number(item.average_monthly), monthsCounted: Number(item.months_counted) }));
  }

  async upsertBudget(userId: string, category: string, currency: string, monthlyLimit: number): Promise<Budget> {
    const { data, error } = await this.client.from("budgets").upsert({ user_id: userId, category, currency, monthly_limit: monthlyLimit }, { onConflict: "user_id,category,currency" }).select("*").single();
    if (error) throw new Error(`Échec d’enregistrement du budget: ${error.message}`);
    return mapBudget(data);
  }

  async deleteBudget(userId: string, budgetId: string): Promise<void> {
    const { error } = await this.client.from("budgets").delete().eq("id", budgetId).eq("user_id", userId);
    if (error) throw new Error(`Échec de suppression du budget: ${error.message}`);
  }

  async spendingBetween(from: Date, to: Date, currency: string, category?: string, accountId?: string): Promise<number> {
    const { data, error } = await this.client.rpc("finance_spending_between", { p_from: from.toISOString(), p_to: to.toISOString(), p_currency: currency, p_category: category ?? null, p_account_id: accountId ?? null });
    if (error) throw new Error(`Échec du calcul entre deux dates: ${error.message}`);
    return Number(data[0]?.total_spent ?? 0);
  }
}

function mapBudgetStatus(row: Database["public"]["Functions"]["finance_budget_status"]["Returns"][number]): BudgetStatus {
  return { budgetId: row.budget_id, category: row.category, currency: row.currency, monthlyLimit: row.monthly_limit === null ? null : Number(row.monthly_limit), spent: Number(row.spent), remaining: row.remaining === null ? null : Number(row.remaining), percentageUsed: row.percentage_used === null ? null : Number(row.percentage_used) };
}

function mapBudget(row: Database["public"]["Tables"]["budgets"]["Row"]): Budget {
  return { id: row.id, userId: row.user_id, category: row.category, currency: row.currency, monthlyLimit: Number(row.monthly_limit), createdAt: row.created_at, updatedAt: row.updated_at };
}

/**
 * Jour auquel arrêter le cumul pour comparer des mois entre eux.
 *
 * Le mois en cours s'arrête à aujourd'hui — le comparer en entier à des mois révolus le ferait
 * paraître exemplaire jusqu'au dernier jour. Un mois passé s'arrête au 31, ce qui revient à le
 * prendre en entier quelle que soit sa longueur.
 */
function dayCutFor(month: string): number {
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return month === currentMonth ? now.getUTCDate() : 31;
}

/**
 * Le dernier jour à tracer sur la courbe des soldes.
 *
 * La série était demandée jusqu'à la fin du mois. Les jours à venir n'ayant, par définition,
 * aucune transaction postérieure, la reconstitution leur donnait le solde d'aujourd'hui : la
 * courbe se prolongeait à plat jusqu'au 31, et ce plat avait exactement l'apparence d'une mesure.
 *
 * Sur un mois révolu la borne ne change rien. Sur le mois en cours elle s'arrête à aujourd'hui,
 * et ce qui suit relève de la prévision — tracée autrement, et dite comme telle.
 */
function balanceHistoryEnd(monthEnd: string): string {
  const now = new Date().toISOString();
  return now < monthEnd ? now : monthEnd;
}
