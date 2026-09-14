"use client";

import { useTranslate } from "@/components/i18n-provider";

/**
 * Sans ce fichier, une erreur serveur affichait l'écran par défaut de Next : un message en
 * anglais, sans explication ni moyen de revenir. C'est ce qu'on a rencontré en production.
 */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslate();
  return <main className="auth-shell">
    <div className="auth-card">
      <div className="brand">clair.</div>
      <h1>{t("error.title")}</h1>
      <p>{t("error.body")}</p>
      <div className="auth-form">
        <button className="primary" onClick={reset}>{t("error.retry")}</button>
        <a className="primary-link" href="/dashboard">{t("common.backToDashboard")}</a>
      </div>
    </div>
  </main>;
}
