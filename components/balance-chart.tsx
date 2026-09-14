"use client";

import { useTranslate, useIntlLocale } from "@/components/i18n-provider";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import type { BalancePoint } from "@/types/analytics";
import { monotone, type Point } from "@/lib/charts/curve";
import type { ForecastPoint } from "@/lib/analytics/cashflow";
import { moneyFormatter } from "@/lib/currency";

const WIDTH = 720;
const HEIGHT = 190;
const PADDING = { top: 16, right: 14, bottom: 24, left: 62 };

/**
 * Single-series balance over time. No legend by design: the card heading names the series.
 * Points rebuilt from transactions are drawn dashed, so an estimate never looks like a
 * measurement — the distinction is carried by the stroke pattern, not by colour alone.
 * Hovering (or arrowing) exposes the exact value for every day, so no number is printed
 * on every point.
 *
 * La prévision prolonge la même courbe vers la fin du mois, et se distingue de deux façons : le
 * trait passe en pointillé, et une bande l'entoure. La bande n'est pas un ornement — c'est elle
 * qui empêche de lire une estimation comme une mesure. Elle n'est calculée que si l'historique
 * lui donne une couverture utile ; en deçà, `forecast` arrive vide et rien n'est tracé.
 */
/**
 * Les étiquettes d'axe donnent l'ordre de grandeur, la bulle donne le montant exact.
 *
 * La notation compacte y suffit tant que les graduations diffèrent. Sur un solde qui varie de
 * cinquante euros autour de mille deux cents, elles se réduisaient toutes trois à « 1,2 k € » :
 * trois étiquettes identiques n'apprennent rien et laissent croire à une échelle plate. La
 * précision est donc choisie sur l'écart entre les graduations, pas sur leur valeur.
 */
function axisMoney(value: number, currency: string, locale: string, spread: number) {
  const compact = spread >= 2000;
  return new Intl.NumberFormat(locale, {
    style: "currency", currency,
    notation: compact ? "compact" : "standard",
    minimumFractionDigits: 0,
    maximumFractionDigits: compact ? 1 : spread < 20 ? 2 : 0
  }).format(value);
}

interface Plotted {
  day: string;
  balance: number;
  reconstructed: boolean;
  projected: boolean;
  low: number;
  high: number;
}

export function BalanceChart({ points, currency, forecast = [] }: { points: BalancePoint[]; currency: string; forecast?: ForecastPoint[] }) {
  const t = useTranslate();
  const locale = useIntlLocale();
  const { money, range } = moneyFormatter(locale);
  const svgRef = useRef<SVGSVGElement>(null);
  /* Les identifiants du dégradé et du masque sont propres à l'instance : deux graphiques sur la
     même page se disputeraient un « #plot-clip » écrit en dur, et le second reprendrait le
     masque du premier. Les deux-points que React produit ne peuvent pas figurer dans url(). */
  const uid = useId().replace(/:/g, "");
  const [focused, setFocused] = useState<number | null>(null);

  const series = useMemo<Plotted[]>(() => [
    ...points.map((point) => ({ day: point.day, balance: point.balance, reconstructed: point.reconstructed, projected: false, low: point.balance, high: point.balance })),
    ...forecast.map((point) => ({ day: point.day, balance: point.expected, reconstructed: false, projected: true, low: point.low, high: point.high }))
  ], [points, forecast]);

  const geometry = useMemo(() => {
    if (series.length < 2) return null;
    /**
     * L'échelle suit ce qui est mesuré et la ligne attendue ; la bande est rognée si elle
     * déborde.
     *
     * L'englober entièrement paraissait honnête et ne l'était pas : une étendue de dépenses
     * large devant le solde écrase la partie mesurée — la seule qui soit certaine — contre le
     * haut du dessin, jusqu'à la rendre illisible. Le lecteur perd alors ce qu'il sait pour
     * mieux voir ce qu'on suppose.
     */
    const values = series.flatMap((point) => [point.balance, point.low, point.high])
      .filter((value) => Number.isFinite(value));
    const measured = series.map((point) => point.balance);
    const measuredSpan = Math.max(...measured) - Math.min(...measured) || Math.abs(Math.max(...measured)) || 1;
    // La bande a droit à deux fois l'amplitude de la courbe, pas davantage.
    const floor = Math.min(...measured) - measuredSpan;
    const ceiling = Math.max(...measured) + measuredSpan;
    const bounded = values.map((value) => Math.min(Math.max(value, floor), ceiling));
    const min = Math.min(...bounded);
    const max = Math.max(...bounded);
    const span = max - min || Math.abs(max) || 1;
    const plotWidth = WIDTH - PADDING.left - PADDING.right;
    const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const x = (index: number) => PADDING.left + (index / (series.length - 1)) * plotWidth;
    const y = (value: number) => PADDING.top + plotHeight - ((value - min) / span) * plotHeight;
    const plot = (from: number, to: number, pick: (point: Plotted) => number): Point[] =>
      series.slice(from, to + 1).map((point, offset) => ({ x: x(from + offset), y: y(pick(point)) }));
    const path = (from: number, to: number, pick: (point: Plotted) => number) => monotone(plot(from, to, pick));

    const lastActual = points.length - 1;
    /**
     * Deux traits pour la partie mesurée, et non un seul.
     *
     * La légende annonce « trait plein : relevé, pointillé : reconstitué » — mais un seul chemin
     * était tracé, avec un style unique choisi sur « tous les points sont-ils reconstitués ? ».
     * Dès qu'un relevé existait, la totalité de la courbe passait en trait plein, y compris les
     * jours reconstitués : la légende décrivait une distinction que le dessin ne faisait pas.
     *
     * Les relevés s'accumulent à partir d'aujourd'hui, si bien que le reconstitué forme toujours
     * un préfixe. La coupure se fait donc au dernier point reconstitué.
     */
    let lastRebuilt = -1;
    points.forEach((point, index) => { if (point.reconstructed) lastRebuilt = index; });
    const rebuiltLine = lastRebuilt > 0 ? path(0, lastRebuilt, (point) => point.balance) : null;
    const measuredLine = lastRebuilt < lastActual ? path(Math.max(lastRebuilt, 0), lastActual, (point) => point.balance) : null;
    const line = path(0, lastActual, (point) => point.balance);
    const baseline = (PADDING.top + plotHeight).toFixed(1);
    // La prévision repart du dernier point mesuré, sinon les deux traits ne se touchent pas.
    const projection = forecast.length ? path(lastActual, series.length - 1, (point) => point.balance) : null;
    const band = forecast.length
      ? `${path(lastActual, series.length - 1, (point) => point.high)} `
        + `${monotone(plot(lastActual, series.length - 1, (point) => point.low).reverse(), true)} Z`
      : null;

    // Reference values for the gridlines. Without them the grid is decoration: the reader
    // sees the shape of the movement but cannot tell whether it spans ten or ten thousand.
    const ticks = [max, min + span / 2, min];
    // Zero deserves its own rule when the series crosses it — on a balance, being above or
    // below it is the whole point.
    const zeroCrosses = min < 0 && max > 0;
    return { x, y, plotWidth, plotHeight, line, rebuiltLine, measuredLine, projection, band, lastActual, ticks, zeroCrosses, min, max, area: `${line} L${x(lastActual).toFixed(1)},${baseline} L${x(0).toFixed(1)},${baseline} Z`, baseline };
  }, [series, points.length, forecast.length]);

  const moveTo = useCallback((clientX: number) => {
    const svg = svgRef.current;
    if (!svg || !geometry) return;
    const rect = svg.getBoundingClientRect();
    const viewX = ((clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (viewX - PADDING.left) / geometry.plotWidth;
    setFocused(Math.min(series.length - 1, Math.max(0, Math.round(ratio * (series.length - 1)))));
  }, [geometry, series.length]);

  if (!geometry) return <p className="empty">{t("balance.notEnoughHistory")}</p>;

  const { x, y, line, rebuiltLine, measuredLine, projection, band, lastActual, area, plotHeight, ticks, zeroCrosses, min, max } = geometry;
  const allReconstructed = points.every((point) => point.reconstructed);
  const last = points[points.length - 1]!;
  const end = series[series.length - 1]!;
  const active = focused === null ? null : series[focused]!;
  const shortDate = (day: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(day));

  return <figure className="chart-figure">
    <div className="chart-frame">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="balance-chart"
        role="img"
        tabIndex={0}
        aria-label={forecast.length
          ? t("balance.ariaWithForecast", { currency, from: money(points[0]!.balance, currency), fromDate: shortDate(points[0]!.day), to: money(last.balance, currency), toDate: shortDate(last.day), forecast: money(end.balance, currency), forecastDate: shortDate(end.day) })
          : t("balance.aria", { currency, from: money(points[0]!.balance, currency), fromDate: shortDate(points[0]!.day), to: money(last.balance, currency), toDate: shortDate(last.day) })}
        /* Le doigt suit la courbe. setPointerCapture garde le suivi même si le doigt sort du
           dessin en glissant, ce qui arrive constamment sur un écran étroit ; sans lui, la
           valeur se fige dès qu'on dépasse le bord. Le relâchement efface le repère. */
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); moveTo(event.clientX); }}
        onPointerMove={(event) => { if (event.buttons > 0 || event.pointerType === "mouse") moveTo(event.clientX); }}
        onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); if (event.pointerType !== "mouse") setFocused(null); }}
        onPointerLeave={() => setFocused(null)}
        onBlur={() => setFocused(null)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          setFocused((current) => {
            const start = current ?? series.length - 1;
            return Math.min(series.length - 1, Math.max(0, start + (event.key === "ArrowRight" ? 1 : -1)));
          });
        }}
      >
        <defs>
          <clipPath id={`plot-${uid}`}><rect x={PADDING.left} y={PADDING.top} width={WIDTH - PADDING.left - PADDING.right} height={HEIGHT - PADDING.top - PADDING.bottom} /></clipPath>
          {/* Un dégradé plutôt qu'un aplat uni sous la courbe. L'aplat uni pose une seconde
              surface colorée qui rivalise avec le trait ; le dégradé s'éteint vers le bas, si
              bien que l'œil garde la ligne et lit l'aire comme son ombre. Les teintes viennent
              de la feuille de style, pour qu'elles suivent le thème. */}
          <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop className="chart-fill-top" offset="0%" />
            <stop className="chart-fill-bottom" offset="100%" />
          </linearGradient>
        </defs>
        {ticks.map((value) => <g key={value}>
          <line className="chart-grid" x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y(value)} y2={y(value)} />
          <text className="chart-axis" x={PADDING.left - 8} y={y(value) + 3.5} textAnchor="end">{axisMoney(value, currency, locale, max - min)}</text>
        </g>)}
        {zeroCrosses && <line className="chart-zero" x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y(0)} y2={y(0)} />}
        <path className="chart-area" d={area} fill={`url(#fill-${uid})`} />
        {band && <g clipPath={`url(#plot-${uid})`}><path className="chart-band" d={band} /></g>}
        {projection && <path className="chart-line chart-line-projected" d={projection} />}
        {rebuiltLine && <path className="chart-line chart-line-estimated" d={rebuiltLine} />}
        {measuredLine && <path className="chart-line" d={measuredLine} />}
        {!rebuiltLine && !measuredLine && <path className={allReconstructed ? "chart-line chart-line-estimated" : "chart-line"} d={line} />}
        {/* La séparation entre ce qui est mesuré et ce qui est estimé mérite d'être marquée :
            sans elle, le changement de trait est la seule indication, et il se remarque mal. */}
        {forecast.length > 0 && <line className="chart-today" x1={x(lastActual)} x2={x(lastActual)} y1={PADDING.top} y2={PADDING.top + plotHeight} />}
        {active && focused !== null && <>
          <line className="chart-crosshair" x1={x(focused)} x2={x(focused)} y1={PADDING.top} y2={PADDING.top + plotHeight} />
          {/* Le trait horizontal et son étiquette vont ensemble : une ligne qui traverse le
              dessin sans dire à quelle hauteur elle passe n'apprend rien. L'étiquette est en
              HTML, à côté de la bulle, et non dans le dessin : un texte SVG ne se mesure pas,
              et il aurait fallu deviner la largeur de sa boîte — que le téléphone, où la
              graduation passe à dix-neuf pixels, aurait de toute façon démentie. */}
          <line className="chart-crosshair" x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y(active.balance)} y2={y(active.balance)} />
          <circle className="chart-focus" cx={x(focused)} cy={y(active.balance)} r={5} />
        </>}
        {/* Le dernier relevé porte un halo : sur une courbe qui se prolonge en prévision, c'est
            le seul repère qui dise où s'arrête ce qu'on sait. */}
        <circle className="chart-endpoint-halo" cx={x(lastActual)} cy={y(last.balance)} r={9} />
        <circle className="chart-endpoint" cx={x(lastActual)} cy={y(last.balance)} r={4.5} />
        <text className="chart-axis" x={PADDING.left} y={HEIGHT - 6}>{shortDate(series[0]!.day)}</text>
        <text className="chart-axis" x={WIDTH - PADDING.right} y={HEIGHT - 6} textAnchor="end">{shortDate(end.day)}</text>
      </svg>
      {active && focused !== null && <div className="chart-axis-tag" style={{ top: `${(y(active.balance) / HEIGHT) * 100}%` }} aria-hidden="true">
        {axisMoney(active.balance, currency, locale, max - min)}
      </div>}
      {active && focused !== null && <div className="chart-tooltip" style={{ left: `${(x(focused) / WIDTH) * 100}%` }} role="status">
        <strong>{money(active.balance, currency)}</strong>
        <span>{shortDate(active.day)} · {active.projected ? t("balance.projected") : active.reconstructed ? t("balance.estimated") : t("balance.measured")}</span>
        {active.projected && <span>{range(active.low, active.high, currency)}</span>}
      </div>}
    </div>
    {/* La légende dit l'essentiel d'abord, le détail ensuite. Sur un téléphone seul l'essentiel
        s'affiche : cinq lignes de gris sous une courbe de quatre-vingt-dix pixels pèsent plus
        que le dessin qu'elles expliquent. Le détail reste dans le document, pour qui l'agrandit
        ou le lit à l'écran. */}
    <figcaption className="chart-caption">
      <span className="caption-short">{forecast.length > 0 ? t("balance.captionShort") : allReconstructed ? t("balance.captionShortEstimated") : points.some((point) => point.reconstructed) ? t("balance.captionShortMeasured") : t("balance.captionShortRecorded")}</span>
      <span className="caption-long"> {allReconstructed ? t("balance.captionReconstructed") : t("balance.captionMixed")}{forecast.length > 0 ? ` ${t("balance.captionForecast")}` : ""}</span>
    </figcaption>
  </figure>;
}
