import { Select } from "@/components/select";
import { PendingSubmit } from "@/components/pending-submit";
import { saveBudget, removeBudget } from "@/app/budgets/actions";
import { AppHeader } from "@/components/app-header";
import { budgetLevel } from "@/lib/analytics/month";
import { budgetOverview } from "@/lib/analytics/budget-overview";
import { getAvailableBudgetCategories } from "@/lib/categories/reference";
import { categoryLabel } from "@/lib/categories/labels";
import { moneyFormatter } from "@/lib/currency";
import type { BudgetStatus, CategoryHistory } from "@/types/database";
import { getTranslations, currentLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/catalogue";

export async function BudgetWorkspace({ email, firstName, month, currency, rows, history, notice, missingConversions = 0, proposal }: {
  email: string; firstName?: string | null; month: string; currency: string;
  rows: BudgetStatus[]; history: CategoryHistory[]; notice?: string; missingConversions?: number; proposal?: { category: string; amount: number };
}) {
  const t = await getTranslations();
  const locale = intlLocale(await currentLocale());
  const { money } = moneyFormatter(locale);
  const overview = budgetOverview(rows);
  const available = getAvailableBudgetCategories(rows.map(row => row.category), overview.configured.map(row => row.category));
  const historyOf = new Map(history.map(row => [row.category, row]));
  const fields = (category?: string) => <><input type="hidden" name="month" value={month}/><input type="hidden" name="currency" value={currency}/>{category && <input type="hidden" name="category" value={category}/>}</>;
  const transactionsLink = (category: string) => `/transactions?${new URLSearchParams({ month, category, status: "booked" })}`;
  return <main className="shell">
    <AppHeader email={email} firstName={firstName} current="/budgets" />
    <h1>{t("budgets.title")}</h1>
    <p className="intro">{t("budgets.scope", { currency })}</p>
    {missingConversions > 0 && <p className="form-error" role="status">{t("budgets.missingConversions", { count: missingConversions })} <a href={`/transactions?month=${month}&status=booked`}>{t("budgets.seeTransactions")}</a></p>}
    {notice && <p className={notice === "saved" || notice === "removed" ? "form-success" : "form-error"} role="status">{t(`budgets.notice.${notice}`)}</p>}
    {proposal && <aside className="assistant-proposal"><h2>{t("assistant.reviewProposal")}</h2><p>{categoryLabel(proposal.category, locale)} · {money(proposal.amount, currency)}</p><p>{t("budgets.confirmProposalHint")}</p><form action={saveBudget}>{fields(proposal.category)}<input type="hidden" name="monthly_limit" value={proposal.amount}/><PendingSubmit className="primary">{t("budgets.confirmProposal")}</PendingSubmit></form></aside>}
    <form className="filters" method="get">
      <label className="field"><span>{t("budgets.month")}</span><input name="month" type="month" defaultValue={month}/></label>
      <button className="filter-button">{t("budgets.apply")}</button>
    </form>
    <div className="workspace-summary">
      <article><span>{t("budgets.totalLimit")}</span><strong>{money(overview.limit, currency)}</strong></article>
      <article><span>{t("budgets.trackedSpent")}</span><strong>{money(overview.spent, currency)}</strong></article>
      <article><span>{t("budgets.remaining")}</span><strong>{money(overview.remaining, currency)}</strong><small>{t("budgets.exceededCount", { count: overview.exceeded })}</small></article>
    </div>
    <p className="hint">{t("budgets.recurringPolicy")}</p>
    <h2>{t("budgets.configured")}</h2>
    {!overview.configured.length && <p className="empty">{t("budgets.startHint")}</p>}
    <section className="budget-list">
      {overview.configured.map(row => <article className={`budget-card budget-${budgetLevel(row.percentageUsed)}`} key={row.category}>
        <div className="budget-head"><div><strong>{categoryLabel(row.category, locale)}</strong><span>{t("budgets.spent", { amount: money(row.spent, currency) })}</span></div><b>{(row.percentageUsed ?? 0).toFixed(0)} %</b></div>
        <div className="budget-progress" role="progressbar" aria-label={categoryLabel(row.category, locale)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, row.percentageUsed ?? 0))} aria-valuetext={`${money(row.spent, currency)} / ${money(row.monthlyLimit!, currency)}`}><span style={{ width: `${Math.min(100, Math.max(0, row.percentageUsed ?? 0))}%` }}/></div>
        <div className="budget-stats"><span>{t("budgets.limit")}<strong>{money(row.monthlyLimit!, currency)}</strong></span><span>{t("budgets.remaining")}<strong>{money(row.remaining!, currency)}</strong></span></div>
        {historyOf.has(row.category) && <p className="budget-habit">{t("budgets.historyHint", { amount: money(historyOf.get(row.category)!.averageMonthly, currency), count: historyOf.get(row.category)!.monthsCounted })}</p>}
        <a className="budget-detail-link" href={transactionsLink(row.category)}>{t("budgets.seeTransactions")}</a>
        <details className="budget-edit"><summary>{t("budgets.edit")}</summary>
          <div className="budget-actions"><form action={saveBudget}>{fields(row.category)}<input name="monthly_limit" type="number" min="0.01" max="100000000" step="0.01" defaultValue={row.monthlyLimit!} required aria-label={t("budgets.fieldLabel", { category: categoryLabel(row.category, locale) })}/><PendingSubmit className="small-button">{t("budgets.edit")}</PendingSubmit></form>
          <form action={removeBudget}>{fields()}<input type="hidden" name="budget_id" value={row.budgetId!}/><PendingSubmit className="danger-button">{t("budgets.delete")}</PendingSubmit></form></div>
          <p className="hint">{t("budgets.removeHint")}</p>
        </details>
      </article>)}
    </section>
    <section className="add-budget-card"><div><span className="label">{t("budgets.new")}</span><h2>{t("budgets.addTitle")}</h2><p>{t("budgets.addHint")}</p></div>
      {available.length ? <form action={saveBudget} className="add-budget-form">{fields()}
        <Select name="category" label={t("budgets.category")} value=""
          options={[{ value: "", label: t("budgets.choose") }, ...available.map((category) => ({ value: category, label: categoryLabel(category, locale) }))]} />
        <label className="field"><span>{t("budgets.monthlyAmount")} ({currency})</span><input name="monthly_limit" type="number" min="0.01" max="100000000" step="0.01" placeholder={t("budgets.amountPlaceholder")} required/></label><PendingSubmit className="primary">{t("budgets.create")}</PendingSubmit>
      </form> : <p className="empty">{t("budgets.allCategoriesUsed")}</p>}
    </section>
    <h2>{t("budgets.unbudgeted")}</h2><p className="hint">{t("budgets.unbudgetedHint")}</p>
    <section className="budget-list">{overview.unbudgeted.map(row => {
      const history = historyOf.get(row.category);
      return <article className="budget-card" key={row.category}><div className="budget-head"><strong>{categoryLabel(row.category, locale)}</strong><span>{money(row.spent, currency)}</span></div>
        {history && <p className="budget-habit">{t("budgets.historyHint", { amount: money(history.averageMonthly, currency), count: history.monthsCounted })}</p>}
        <a className="budget-detail-link" href={transactionsLink(row.category)}>{t("budgets.seeTransactions")}</a>
        {available.includes(row.category) && <form className="budget-inline-form" action={saveBudget}>{fields(row.category)}<label className="field"><span>{t("budgets.monthlyAmount")} ({currency})</span><input name="monthly_limit" type="number" min="0.01" max="100000000" step="0.01" required placeholder={t("budgets.fieldPlaceholder")}/></label><PendingSubmit className="small-button">{t("budgets.set")}</PendingSubmit></form>}
      </article>;
    })}</section>
  </main>;
}
