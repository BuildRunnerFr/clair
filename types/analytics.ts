import type { NormalizedTransaction } from "./banking";

export interface SpendingContext {
  dateFrom: string;
  dateTo: string;
  currency?: string;
  totalsByCategory: Record<string, number>;
  total: number;
}

export interface DashboardSummary {
  totalSpent: number;
  previousMonthSpent: number;
  budgetRemaining: number;
  byCategory: Array<{ name: string; amount: number }>;
  topMerchants: Array<{ name: string; amount: number }>;
  latest: NormalizedTransaction[];
}

export interface MonthlyPoint {
  month: string;
  spent: number;
}

export interface BalancePoint {
  day: string;
  balance: number;
  reconstructed: boolean;
}

export interface SqlDashboardSummary {
  /** Currency every aggregate below is expressed in. */
  baseCurrency: string;
  totalSpent: number;
  /** Dépenses encore en attente, exclues de totalSpent : leur montant peut changer, ou ne jamais aboutir. */
  pendingSpent: number;
  previousMonthSpent: number;
  changePercent: number | null;
  configuredBudget: number;
  budgetRemaining: number;
  byCategory: Array<{ name: string; amount: number }>;
  budgetStatus: import("./database").BudgetStatus[];
  topMerchants: Array<{ name: string; amount: number }>;
  balanceHistory: BalancePoint[];
  monthlyTrend: MonthlyPoint[];
  /** Comparaison à date égale avec les mois passés. Null quand aucun mois ne précède. */
  typicalMonth: import("@/lib/analytics/typical-month").TypicalMonth | null;
  /** Ce qui est entré ce mois-ci, virements entre comptes propres exclus. */
  income: number;
  /** Ce qui en est sorti, virements exclus eux aussi — pour que la différence soit juste. */
  outflow: number;
  /** Le montant des virements écartés des deux côtés, pour pouvoir l'énoncer. */
  transfersExcluded: number;
  /** Les dépenses non récurrentes par jour, matière première de la prévision de solde. */
  dailyDiscretionary: import("@/lib/analytics/cashflow").DailySpend[];
  latest: Array<{
    id: string;
    providerTransactionId: string;
    merchantName: string;
    description: string;
    amount: number;
    currency: string;
    amountBase: number | null;
    baseCurrency: string;
    transactionDate: string;
    category: string;
    subcategory: string;
    pending: boolean;
  }>;
}
