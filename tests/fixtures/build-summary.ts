import type { SqlDashboardSummary } from "@/types/analytics";
import type { Account, BudgetStatus } from "@/types/database";
import { typicalMonth } from "@/lib/analytics/typical-month";

/**
 * Fabrique un tableau de bord complet à partir d'opérations, comme la base le ferait.
 *
 * Les agrégats viennent normalement de fonctions SQL. Les recalculer ici n'en vérifie pas la
 * justesse — c'est un second calcul, pas une preuve — mais cela permet de fabriquer autant de
 * situations qu'on veut et de regarder ce que l'interface en fait : un mois vide, un solde
 * négatif, un marchand au nom interminable, douze devises. C'est l'affichage qu'on éprouve ici,
 * pas l'arithmétique de Postgres.
 */
export interface Movement {
  date: string;
  merchant: string;
  amount: number;
  category: string;
  subcategory?: string;
  currency?: string;
  pending?: boolean;
  account?: string;
  recurring?: boolean;
}

export interface ScenarioInput {
  name: string;
  today: Date;
  baseCurrency?: string;
  accounts: Array<Pick<Account, "id" | "name" | "currency"> & { balance: number | null; overdraft?: number | null; available?: number | null }>;
  movements: Movement[];
  budgets?: Array<{ category: string; limit: number }>;
  pendingSpent?: number;
}

const monthOf = (iso: string) => iso.slice(0, 7);

export function buildAccounts(input: ScenarioInput): Account[] {
  return input.accounts.map((account) => ({
    id: account.id, userId: "u1", provider: "truelayer", providerAccountId: account.id,
    name: account.name, currency: account.currency,
    balanceCurrent: account.balance, balanceAvailable: account.available ?? account.balance,
    balanceOverdraft: account.overdraft ?? null,
    balanceUpdatedAt: input.today.toISOString(), createdAt: input.today.toISOString()
  }));
}

export function buildSummary(input: ScenarioInput): SqlDashboardSummary {
  const base = input.baseCurrency ?? "EUR";
  const month = `${input.today.getUTCFullYear()}-${String(input.today.getUTCMonth() + 1).padStart(2, "0")}`;
  const previous = new Date(Date.UTC(input.today.getUTCFullYear(), input.today.getUTCMonth() - 1, 1));
  const previousMonth = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;

  const settled = input.movements.filter((item) => !item.pending);
  const thisMonth = settled.filter((item) => monthOf(item.date) === month);
  const spending = (rows: Movement[]) => rows.filter((item) => item.amount < 0).reduce((total, item) => total - item.amount, 0);

  const byCategory = new Map<string, number>();
  for (const item of thisMonth) if (item.amount < 0) byCategory.set(item.category, (byCategory.get(item.category) ?? 0) - item.amount);
  const byMerchant = new Map<string, number>();
  for (const item of thisMonth) if (item.amount < 0) byMerchant.set(item.merchant, (byMerchant.get(item.merchant) ?? 0) - item.amount);

  // Douze mois de tendance, à zéro quand le mois est absent : une série trouée déforme un
  // graphique en rapprochant deux points éloignés dans le temps.
  const months: string[] = [];
  for (let back = 5; back >= 0; back--) {
    const date = new Date(Date.UTC(input.today.getUTCFullYear(), input.today.getUTCMonth() - back, 1));
    months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const cut = input.today.getUTCDate();
  const toDate = [...new Set(settled.map((item) => monthOf(item.date)))].sort().slice(-12).map((m) => ({
    month: m,
    total: spending(settled.filter((item) => monthOf(item.date) === m && Number(item.date.slice(8, 10)) <= cut))
  }));

  const budgetStatus: BudgetStatus[] = (input.budgets ?? []).map((budget, index) => {
    const spent = byCategory.get(budget.category) ?? 0;
    return {
      budgetId: `b${index}`, category: budget.category, currency: base, monthlyLimit: budget.limit,
      spent: round(spent), remaining: round(budget.limit - spent),
      percentageUsed: budget.limit > 0 ? round((spent / budget.limit) * 100) : null
    };
  });
  const configuredBudget = budgetStatus.reduce((total, item) => total + (item.monthlyLimit ?? 0), 0);

  const currencyAccounts = input.accounts.filter((account) => account.currency === base);
  const totalBalance = currencyAccounts.reduce((total, account) => total + (account.balance ?? 0), 0);
  const balanceHistory = buildBalanceHistory(month, input.today, totalBalance, settled, base);

  const recurringMerchants = new Set(input.movements.filter((item) => item.recurring).map((item) => item.merchant));
  const daily = new Map<string, number>();
  for (const item of settled) {
    if (item.amount >= 0 || item.category === "Transfers" || recurringMerchants.has(item.merchant)) continue;
    const key = `${monthOf(item.date)}|${Number(item.date.slice(8, 10))}`;
    daily.set(key, (daily.get(key) ?? 0) - item.amount);
  }

  const latest = [...thisMonth, ...input.movements.filter((item) => item.pending && monthOf(item.date) === month)]
    .sort((left, right) => right.date.localeCompare(left.date)).slice(0, 8);

  return {
    baseCurrency: base,
    totalSpent: round(spending(thisMonth)),
    pendingSpent: input.pendingSpent ?? round(spending(input.movements.filter((item) => item.pending && monthOf(item.date) === month))),
    previousMonthSpent: round(spending(settled.filter((item) => monthOf(item.date) === previousMonth))),
    changePercent: null,
    configuredBudget,
    budgetRemaining: round(configuredBudget - budgetStatus.reduce((total, item) => total + item.spent, 0)),
    byCategory: [...byCategory].map(([name, amount]) => ({ name, amount: round(amount) })).sort((a, b) => b.amount - a.amount),
    budgetStatus,
    topMerchants: [...byMerchant].map(([name, amount]) => ({ name, amount: round(amount) })).sort((a, b) => b.amount - a.amount).slice(0, 5),
    balanceHistory,
    monthlyTrend: months.map((m) => ({ month: m, spent: round(spending(settled.filter((item) => monthOf(item.date) === m))) })),
    typicalMonth: typicalMonth(toDate, month),
    income: round(thisMonth.filter((item) => item.amount > 0 && item.category !== "Transfers").reduce((total, item) => total + item.amount, 0)),
    outflow: round(thisMonth.filter((item) => item.amount < 0 && item.category !== "Transfers").reduce((total, item) => total - item.amount, 0)),
    transfersExcluded: round(thisMonth.filter((item) => item.category === "Transfers").reduce((total, item) => total + Math.abs(item.amount), 0)),
    dailyDiscretionary: [...daily].map(([key, total]) => {
      const [m, day] = key.split("|");
      return { month: m!, day: Number(day), total: round(total) };
    }),
    latest: latest.map((item, index) => ({
      id: `t${index}`, providerTransactionId: `t${index}`,
      merchantName: item.merchant, description: item.merchant,
      amount: item.amount, currency: item.currency ?? base,
      amountBase: item.currency && item.currency !== base ? round(item.amount * 0.86) : item.amount,
      baseCurrency: base, transactionDate: `${item.date}T10:00:00.000Z`,
      category: item.category, subcategory: item.subcategory ?? "Other", pending: item.pending ?? false
    }))
  };
}

/** Le solde reconstitué à rebours, comme la base le fait : solde actuel moins ce qui a suivi. */
function buildBalanceHistory(month: string, today: Date, finalBalance: number, movements: Movement[], base: string) {
  const points: SqlDashboardSummary["balanceHistory"] = [];
  for (let day = 1; day <= today.getUTCDate(); day++) {
    const iso = `${month}-${String(day).padStart(2, "0")}`;
    const after = movements
      .filter((item) => (item.currency ?? base) === base && item.date > iso)
      .reduce((total, item) => total + item.amount, 0);
    points.push({ day: iso, balance: round(finalBalance - after), reconstructed: day < today.getUTCDate() - 2 });
  }
  return points;
}

function round(value: number) { return Math.round(value * 100) / 100; }
