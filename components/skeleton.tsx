import { getTranslations } from "@/lib/i18n/server";

/**
 * Shown by Next.js the moment a navigation starts, so changing a filter gives immediate
 * feedback instead of a frozen page while seven aggregates run.
 *
 * It mirrors the real grid — same card spans, same order — so the layout does not jump when
 * the data arrives. A skeleton that reflows on replacement is worse than none.
 */
export async function DashboardSkeleton() {
  const t = await getTranslations();
  return <main className="shell" aria-busy="true" aria-live="polite">
    <span className="visually-hidden">{t("common.loadingData")}</span>
    <header className="header"><div className="skeleton skeleton-brand" /><div className="skeleton skeleton-nav" /></header>
    <div className="skeleton skeleton-title" />
    <div className="skeleton skeleton-panel" />
    <div className="grid">
      {["metric", "metric", "metric"].map((span, index) => <article className={`card ${span}`} key={index}>
        <div className="skeleton skeleton-label" />
        <div className="skeleton skeleton-value" />
      </article>)}
      <article className="card full"><div className="skeleton skeleton-label" /><div className="skeleton skeleton-chart" /></article>
      {["wide", "side", "wide", "side"].map((span, index) => <article className={`card ${span}`} key={index}>
        <div className="skeleton skeleton-label" />
        {[0, 1, 2, 3].map((row) => <div className="skeleton skeleton-row" key={row} />)}
      </article>)}
    </div>
  </main>;
}

/**
 * Squelette générique pour les pages autres que le tableau de bord. Elles interrogeaient
 * toutes la base sans afficher le moindre signe d'activité pendant l'attente.
 */
export async function PageSkeleton() {
  const t = await getTranslations();
  return <main className="shell" aria-busy="true" aria-live="polite">
    <span className="visually-hidden">{t("common.loading")}</span>
    <header className="header"><div className="skeleton skeleton-brand" /><div className="skeleton skeleton-nav" /></header>
    <div className="skeleton skeleton-title" />
    {[0, 1, 2].map((index) => <article className="card" key={index} style={{ marginBottom: "var(--s3)" }}>
      <div className="skeleton skeleton-label" />
      {[0, 1, 2].map((row) => <div className="skeleton skeleton-row" key={row} />)}
    </article>)}
  </main>;
}
