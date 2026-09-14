import { ClassificationPicker } from "@/components/classification-picker";
import { PendingSubmit } from "@/components/pending-submit";
import { getTranslations, currentLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/catalogue";
import type { SqlDashboardSummary } from "@/types/analytics";
import { moneyFormatter } from "@/lib/currency";
import { displayedAmount, transactionTotals } from "@/lib/transactions/amounts";
import { categoryLabel, subcategoryLabel } from "@/lib/categories/labels";
import { colorOf } from "@/lib/categories/families";
import { reclassifyFromTransactions } from "@/app/transactions/actions";
import { Select } from "@/components/select";

type Transaction = SqlDashboardSummary["latest"][number] & { accountName?: string };

/**
 * Transactions regroupées par jour, avec le total de la journée.
 *
 * Une liste plate oblige à relire une date sur chaque ligne pour repérer où commence un jour.
 * Le regroupement est le motif retenu par les applications bancaires de référence, et il
 * apporte au passage une information que la liste ne donnait pas : ce qu'une journée a coûté.
 *
 * En mode déplié, chaque ligne s'ouvre sur ce que le résumé ne peut pas montrer — le libellé
 * complet de la banque, l'heure, le compte, le montant d'origine — et sur le moyen de corriger
 * son classement. C'est en lisant ses opérations qu'on s'aperçoit qu'une est mal rangée : la
 * correction doit être là, et non sur une autre page où il faudrait retrouver le marchand.
 *
 * Le dépliement repose sur `details`, pas sur du JavaScript : il fonctionne au clavier, à la
 * souris et sans script, et le navigateur en gère l'état d'ouverture.
 */
export async function TransactionList({ transactions, baseCurrency, expandable = false, returnTo }: {
  transactions: Transaction[];
  baseCurrency: string;
  expandable?: boolean;
  returnTo?: string;
}) {
  const t = await getTranslations();
  const locale = intlLocale(await currentLocale());
  const { money } = moneyFormatter(locale);
  if (!transactions.length) return <p className="empty">{t("transactions.emptyPeriod")}</p>;

  const days = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const day = transaction.transactionDate.slice(0, 10);
    days.set(day, [...(days.get(day) ?? []), transaction]);
  }

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const dayLabel = (day: string) =>
    day === today ? t("date.today")
    : day === yesterday ? t("date.yesterday")
    : new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${day}T12:00:00Z`));

  return <div className="transaction-days">
    {[...days.entries()].map(([day, items]) => {
      // Seules les dépenses sont totalisées : mêler un remboursement au total du jour
      // afficherait un montant que rien dans la liste n'explique.
      const totals = transactionTotals(items);
      return <section key={day}>
        <header className="transaction-day">
          <span>{dayLabel(day)}</span>
          <span className="transaction-day-total">{totals.filter(row => row.spent > 0).map(row => <span key={row.currency}>−{money(row.spent, row.currency)} </span>)}</span>
        </header>
        <ul className="transactions">
          {items.map((item) => <li className="transaction-item" key={item.id}>
            {expandable
              ? <details className="transaction-details">
                  <summary className="transaction">{row(item)}</summary>
                  <Detail item={item} locale={locale} returnTo={returnTo} t={t} money={money} />
                </details>
              : <div className="transaction">{row(item)}</div>}
          </li>)}
        </ul>
      </section>;
    })}
  </div>;

  function row(item: Transaction) {
    return <>
      <span className="merchant">{title(item.merchantName)}</span>
      <span className="meta"><i className="category-dot" style={{ background: colorOf(item.category) }} aria-hidden="true" />{categoryLabel(item.category, locale)}{item.pending ? ` · ${t("transactions.pending")}` : ""}</span>
      <span className={item.amount < 0 ? "amount" : "amount amount-credit"}>
        {item.amount < 0 ? "−" : "+"}{money(Math.abs(displayedAmount(item).amount), displayedAmount(item).currency)}
        {item.amountBase !== null && item.currency !== item.baseCurrency && <small className="amount-origin">{money(Math.abs(item.amount), item.currency)}</small>}
      </span>
    </>;
  }
}

async function Detail({ item, locale, returnTo, t, money }: {
  item: Transaction;
  locale: string;
  returnTo?: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
  money: (value: number, currency: string) => string;
}) {
  const stamp = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short" }).format(new Date(item.transactionDate));
  // Le libellé brut n'est montré que s'il apporte quelque chose : répété sous un nom déjà
  // affiché, il donnerait l'impression d'un détail sans en être un.
  const rawIsUseful = item.description && item.description.toLowerCase() !== item.merchantName.toLowerCase();
  return <div className="transaction-panel">
    <dl className="transaction-facts">
      <div><dt>{t("transactions.when")}</dt><dd>{stamp}</dd></div>
      {item.accountName && <div><dt>{t("transactions.account")}</dt><dd>{item.accountName}</dd></div>}
      <div><dt>{t("transactions.filedUnder")}</dt><dd>{categoryLabel(item.category, locale)} · {subcategoryLabel(item.subcategory, locale)}</dd></div>
      {item.amountBase !== null && item.currency !== item.baseCurrency &&
        <div><dt>{t("transactions.originalAmount")}</dt><dd>{money(Math.abs(item.amount), item.currency)}</dd></div>}
      {rawIsUseful && <div className="transaction-raw"><dt>{t("transactions.bankLabel")}</dt><dd>{item.description}</dd></div>}
    </dl>
    <form className="reclassify" action={reclassifyFromTransactions}>
      <input type="hidden" name="merchant" value={item.merchantName} />
      <input type="hidden" name="transactionId" value={item.id} />
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      <ClassificationPicker category={item.category} subcategory={item.subcategory}/>
      <div className="reclassify-scope"><Select name="scope" label={t("transactions.correctionScope")} value="transaction" options={[{ value: "transaction", label: t("transactions.onlyThis") }, { value: "merchant", label: t("transactions.allMerchant") }]} /></div>
      <PendingSubmit className="secondary-button">{t("transactions.reclassify")}</PendingSubmit>
    </form>
    <p className="transaction-hint">{t("transactions.correctionHint", { merchant: title(item.merchantName) })}</p>
  </div>;
}

function title(value: string) { return value.toLowerCase().replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase()); }
