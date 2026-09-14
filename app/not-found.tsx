import { getTranslations } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getTranslations();
  return <main className="auth-shell">
    <div className="auth-card">
      <div className="brand">clair.</div>
      <h1>{t("notFound.title")}</h1>
      <p>{t("notFound.body")}</p>
      <a className="primary-link" href="/dashboard">{t("common.backToDashboard")}</a>
    </div>
  </main>;
}
