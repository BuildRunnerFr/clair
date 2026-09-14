import { intlLocale } from "@/lib/i18n/catalogue";
import { getTranslations, currentLocale } from "@/lib/i18n/server";
import type { BudgetAlert } from "@/lib/analytics/budget-alerts";
import { moneyFormatter } from "@/lib/currency";

/**
 * Les budgets dépassés, mis en tête du tableau de bord.
 *
 * Séparé des cartes de budget à dessein : celles-ci répondent à « où j'en suis », question qu'on
 * se pose en allant les consulter. Un dépassement répond à « qu'est-ce qui ne va pas », qu'on ne
 * se pose pas — il faut donc le porter à l'utilisateur, pas l'attendre.
 *
 * Rien ne s'affiche quand tout va bien. Un bandeau permanent « 0 alerte » occuperait la place la
 * plus visible de la page pour n'y rien dire, et rendrait invisible le jour où il dit quelque
 * chose.
 */
export async function BudgetAlerts({ alerts, currency, month }: { alerts: BudgetAlert[]; currency: string; month: string }) {
  const t = await getTranslations();
  const { money } = moneyFormatter(intlLocale(await currentLocale()));
  if (!alerts.length) return null;

  return <section className="alerts" aria-label={t("dashboard.alertsLabel")}>
    {alerts.map((alert) => <a className="alert" key={alert.category} href={`/budgets?month=${month}&currency=${currency}`}>
      <span className="alert-mark" aria-hidden="true">!</span>
      <span className="alert-text">
        <strong>{alert.category}</strong>
        <span>{t("dashboard.alertOverrun", { overrun: money(alert.overrun, currency), spent: money(alert.spent, currency), limit: money(alert.monthlyLimit, currency) })}</span>
      </span>
      <span className="alert-go" aria-hidden="true">→</span>
    </a>)}
  </section>;
}
