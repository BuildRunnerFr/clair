import { getTranslations, currentLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/catalogue";
import { moneyFormatter } from "@/lib/currency";
import { yearlyCost, type StoredSubscription } from "@/lib/subscriptions/detect";


/**
 * Ce que les prélèvements récurrents coûtent sur un an.
 *
 * Le coût annualisé est mis en avant plutôt que le montant du prélèvement : c'est la grandeur
 * qui décide d'une résiliation. Vingt euros par mois ne se compare pas à cent euros par an tant
 * qu'on n'a pas ramené les deux à la même échelle, et c'est précisément l'arbitrage que
 * l'utilisateur cherche à faire.
 */
export async function SubscriptionsCard({ subscriptions, baseCurrency }: { subscriptions: StoredSubscription[]; baseCurrency: string }) {
  const t = await getTranslations();
  const { money } = moneyFormatter(intlLocale(await currentLocale()));
  if (!subscriptions.length) {
    return <p className="empty">{t("subscriptions.empty")}</p>;
  }

  const totals = new Map<string, number>();
  for (const subscription of subscriptions) totals.set(subscription.currency, (totals.get(subscription.currency) ?? 0) + yearlyCost(subscription));
  return <div className="subscriptions">
    <div className="balance-total">
      <span className="balance-secondary">{t("subscriptions.annualTotal", { count: subscriptions.length })}</span>
      <div className="subscription-totals">{[...totals].map(([currency, total]) => <strong key={currency}>{money(total, currency)}</strong>)}</div>
    </div>
    {[...subscriptions].sort((a, b) => a.currency.localeCompare(b.currency) || yearlyCost(b) - yearlyCost(a)).map((subscription) => <div className="subscription-row" key={`${subscription.merchantName}-${subscription.currency}`}>
      <a className="subscription-name" href={`/transactions?${new URLSearchParams({ q: subscription.merchantName, status: "booked" })}`} title={t("subscriptions.history")}>{title(subscription.merchantName)}</a>
      <span className="balance-secondary">
        {money(subscription.latestAmount, subscription.currency)} {t(`subscriptions.${subscription.frequency}`)}
        {/* Une hausse de loyer se voit ici et nulle part ailleurs : la moyenne la dissimulait. */}
        {subscription.previousAmount !== null && <em className="subscription-change">{subscription.previousAmount < subscription.latestAmount ? "↑" : "↓"} {t("subscriptions.previous", { amount: money(subscription.previousAmount, subscription.currency) })}</em>}
      </span>
      <strong>{money(yearlyCost(subscription), subscription.currency)}<small className="amount-origin">{t("subscriptions.yearly")}</small></strong>
    </div>)}
    <p className="hint">{t("subscriptions.estimate")}</p>
  </div>;
}

function title(value: string) { return value.toLowerCase().replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase()); }
