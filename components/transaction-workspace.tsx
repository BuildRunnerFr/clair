import { intlLocale } from "@/lib/i18n/catalogue";
import { getTranslations, currentLocale } from "@/lib/i18n/server";
import { AppHeader } from "@/components/app-header";
import { TransactionList } from "@/components/transaction-list";
import { CATEGORY_NAMES } from "@/lib/categories/taxonomy";
import { Select } from "@/components/select";
import { accountLabels } from "@/lib/accounts/label";
import { categoryLabel } from "@/lib/categories/labels";
import { transactionTotals } from "@/lib/transactions/amounts";
import { moneyFormatter } from "@/lib/currency";

import type { Account, StoredTransaction } from "@/types/database";
export type TransactionFilters = { q?: string; category?: string; month?: string; page?: number; account?: string; status?: "booked" | "pending"; reclassified?: number; error?: string };
const PAGE_SIZE = 50;
export async function TransactionWorkspace({ transactions, total, baseCurrencyRow, accounts, filters, email, firstName, totals: allTotals }: {
  transactions: StoredTransaction[]; total: number; baseCurrencyRow: string; accounts: Account[];
  totals?: ReturnType<typeof transactionTotals>; filters: TransactionFilters; email: string; firstName?: string | null;
}) {
  const t = await getTranslations();
  const locale = await currentLocale();
  const { money } = moneyFormatter(intlLocale(locale));
  const page = filters.page ?? 1;
  const etiquettes = accountLabels(accounts);
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));

  const totals = allTotals ?? transactionTotals(transactions);
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const link = (target: number, override: { month?: string | null } = {}) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.category) params.set("category", filters.category);
    if (filters.account) params.set("account", filters.account);
    if (filters.status) params.set("status", filters.status);
    const month = override.month === undefined ? filters.month : override.month;
    if (month) params.set("month", month);
    if (target > 1) params.set("page", String(target));
    return `/transactions${params.size ? `?${params}` : ""}`;
  };
  // L'adresse de retour après une correction : la même page, aux mêmes filtres, à la même
  // position. Renvoyer en tête de liste obligerait à refaire le chemin pour corriger la ligne
  // suivante, et une correction en appelle souvent une autre.
  const returnTo = link(page);

  return <main className="shell">
    <AppHeader email={email} firstName={firstName} current="/transactions" />
    <h1>{t("transactions.heading")}</h1>
    <p className="intro">{t(total > 1 ? "transactions.countMany" : "transactions.countOne", { count: total })}
      {" · "}{filters.month
        ? new Intl.DateTimeFormat(intlLocale(await currentLocale()), { month: "long", year: "numeric" }).format(new Date(`${filters.month}-01T12:00:00Z`))
        : t("transactions.allTimeActive")}
      </p>
    <p className="hint">{t("transactions.totalsScope")}</p>
    <div className="workspace-summary">{totals.map(row => <article key={row.currency}><span>{row.currency} · {t("transactions.bookedTotals")}</span><strong>−{money(row.spent, row.currency)}</strong><small>+{money(row.received, row.currency)} {t("transactions.received")}</small>{row.pending > 0 && <small>{t("transactions.pendingTotal", { amount: money(row.pending, row.currency) })}</small>}</article>)}</div>
    {filters.reclassified !== undefined && <p className="form-success" role="status">{t(filters.reclassified > 1 ? "transactions.reclassifiedMany" : "transactions.reclassifiedOne", { count: filters.reclassified })}</p>}
    {filters.error && <p className="bank-error" role="alert">{t("transactions.reclassifyFailed")}</p>}

    <form className="filters transaction-filters" method="get">
      <label className="field"><span>{t("transactions.search")}</span>
        <input name="q" type="search" defaultValue={filters.q ?? ""} placeholder={t("transactions.searchPlaceholder")} /></label>
      <Select name="category" label={t("common.category")} value={filters.category ?? ""}
        options={[{ value: "", label: t("transactions.allCategories") },
          ...CATEGORY_NAMES.map((name) => ({ value: name, label: categoryLabel(name, intlLocale(locale)) }))]} />
      {/* Sans mois, la recherche porte sur tout l'historique — c'est déjà le comportement, mais
          rien ne le disait, et un champ de mois vide ne s'annonce pas comme « toutes périodes ».
          Le lien de retrait rend la bascule explicite : on n'efface pas un champ de date natif
          par hasard. */}
      <label className="field"><span>{t("common.month")}</span>
        <input name="month" type="month" defaultValue={filters.month ?? ""} />
      </label>
      {/* Le libellé porte la devise : plusieurs portefeuilles d'une même banque partagent leur
          nom, et le nom seul les rendait indiscernables. */}
      <Select name="account" label={t("transactions.account")} value={filters.account ?? ""}
        options={[{ value: "", label: t("transactions.allAccounts") },
          ...accounts.map((account) => ({ value: account.id, label: etiquettes.get(account.id) ?? account.name }))]} />
      <Select name="status" label={t("transactions.status")} value={filters.status ?? ""}
        options={[{ value: "", label: t("transactions.allStatuses") }, { value: "booked", label: t("transactions.booked") }, { value: "pending", label: t("transactions.pending") }]} />
      <button className="filter-button">{t("transactions.search")}</button>
      {/* La recherche textuelle garde son bouton : appliquer à chaque frappe relancerait une
          requête par caractère. Les listes déroulantes, elles, s'appliquent au changement. */}

    </form>

    <nav className="workspace-shortcuts" aria-label={t("transactions.quickFilters")}>
      {filters.month && <a href={link(1, { month: null })}>{t("transactions.allTime")}</a>}
      <a href="/transactions?category=Uncategorized">{t("transactions.toReview")}</a><a href="/transactions">{t("transactions.resetFilters")}</a><a href="/budgets">{t("budgets.title")}</a>
    </nav>
    {!transactions.length && <p className="hint">{t("transactions.emptySearchHint")}</p>}
    <article className="card">
      <TransactionList transactions={transactions.map((item) => ({
        id: item.id ?? `${item.accountId}-${item.providerTransactionId}`,
        providerTransactionId: item.providerTransactionId,
        merchantName: item.merchantName,
        description: item.description,
        amount: item.amount,
        currency: item.currency,
        amountBase: item.amountBase ?? null,
        baseCurrency: item.baseCurrency ?? baseCurrencyRow,
        transactionDate: item.transactionDate,
        category: item.category,
        subcategory: item.subcategory,
        pending: item.pending,
        accountName: accountNames.get(item.accountId)
      }))} baseCurrency={baseCurrencyRow} expandable returnTo={returnTo} />
    </article>

    {pages > 1 && <nav className="pagination" aria-label={t("transactions.pages")}>
      {page > 1 && <a className="secondary-button" href={link(page - 1)}>{t("transactions.previous")}</a>}
      <span className="balance-secondary">{t("transactions.pageOf", { page, pages })}</span>
      {page < pages && <a className="secondary-button" href={link(page + 1)}>{t("transactions.next")}</a>}
    </nav>}
  </main>;
}
