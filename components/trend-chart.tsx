import type React from "react";
import { getTranslations, currentLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/catalogue";
import type { MonthlyPoint } from "@/types/analytics";
import { moneyFormatter } from "@/lib/currency";

/**
 * Dépenses des six derniers mois.
 *
 * Des barres et non un anneau : la question est « ce mois-ci contre les précédents », donc une
 * comparaison de grandeurs sur une base commune. Un anneau conviendrait à une répartition en
 * parts d'un tout, pas à une évolution.
 *
 * Le mois affiché est mis en évidence plutôt qu'isolé : le situer parmi les autres est
 * précisément ce qu'un chiffre seul ne dit pas.
 */
export async function TrendChart({ points, currency, currentMonth }: { points: MonthlyPoint[]; currency: string; currentMonth: string }) {
  const t = await getTranslations();
  const locale = intlLocale(await currentLocale());
  const { money, range, amount } = moneyFormatter(locale);
  if (points.length < 2) return <p className="empty">{t("trend.notEnoughHistory")}</p>;

  const max = Math.max(...points.map((point) => point.spent), 1);
  /**
   * La moyenne ne porte que sur les mois que le relevé couvre.
   *
   * Elle divisait par six quoi qu'il arrive. Un compte connecté depuis trois semaines n'a qu'un
   * mois de données, et les cinq précédents reviennent à zéro faute d'être couverts : la moyenne
   * était donc divisée par six, et cinquante-quatre euros dépensés s'affichaient « neuf euros de
   * moyenne ». Un chiffre faux, présenté comme un repère.
   *
   * Un zéro avant la première dépense connue signale un mois hors du relevé ; un zéro après
   * signale un vrai mois sans dépense, et celui-là compte. C'est la même distinction que celle
   * qui a valu une migration à finance_month_to_date, et elle se tranche ici sur l'ordre.
   */
  const covered = points.findIndex((point) => point.spent > 0);
  const known = covered === -1 ? [] : points.slice(covered);
  const average = known.length ? known.reduce((total, point) => total + point.spent, 0) / known.length : 0;
  const label = (month: string) => new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(`${month}-01T00:00:00Z`));

  /* La moyenne se dessine au lieu de se dire. Elle était en légende sous le graphique : un
     nombre qu'il fallait rapporter soi-même à six barres, ce que personne ne fait. Tracée à sa
     hauteur, elle répond d'un regard à la question que des barres seules posent — haute ou basse
     par rapport à quoi. La hauteur est passée en variable, la position se calcule en CSS. */
  const averageHeight = Math.min((average / max) * 100, 100);

  return <div className="trend">
    <div className="trend-bars" style={{ "--average": averageHeight } as React.CSSProperties}>
      {points.map((point, index) => {
        const current = point.month === currentMonth;
        return <div className={current ? "trend-bar trend-bar-current" : "trend-bar"} key={point.month}>
          {/* « — » quand le mois n'est pas couvert, « 0 » quand il l'est et qu'il n'y a rien eu :
              un tiret là où un zéro est vrai efface une information. */}
          <span className="trend-value">{point.spent ? amount(point.spent) : index < covered || covered === -1 ? "—" : amount(0)}</span>
          <div className="trend-column"><span style={{ height: `${Math.max((point.spent / max) * 100, point.spent ? 3 : 0)}%` }} /></div>
          <span className="trend-month">{label(point.month)}</span>
        </div>;
      })}
    </div>
    {/* La moyenne donne l'étalon qui manque à des barres seules : haute ou basse par rapport à quoi. */}
    <p className="trend-caption">{t("trend.average", { amount: money(average, currency) })}</p>
  </div>;
}
