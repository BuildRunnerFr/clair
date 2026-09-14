import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { ProviderButtons } from "@/components/provider-buttons";
import { enabledProviders } from "@/lib/auth/providers";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "@/lib/i18n/server";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Connexion" };

/** Les codes d'erreur que les routes d'authentification renvoient, et leur clé de traduction. */
const ERROR_KEYS: Record<string, string> = {
  expired_link: "login.error.expiredLink",
  invalid_link: "login.error.invalidLink",
  missing_token: "login.error.missingToken",
  invalid_type: "login.error.invalidType",
  provider_denied: "login.error.providerDenied"
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/dashboard");
  const params = await searchParams;
  const t = await getTranslations();
  const errorKey = typeof params.error === "string" ? ERROR_KEYS[params.error] : undefined;
  const error = errorKey ? t(errorKey) : undefined;
  const next = typeof params.next === "string" ? params.next : undefined;
  const providers = await enabledProviders();
  const deleted = params.deleted === "1";
  // Suppression faite, mais une banque n'a pas confirmé le retrait : c'est le seul moment où
  // l'utilisateur peut encore agir, ses jetons venant d'être effacés de notre côté.
  const deletedPartial = params.deleted === "partial";
  return <main className="auth-shell"><div className="auth-card">
    <a className="brand brand-link" href="/" aria-label={t("login.backHome")}>clair.</a>
    <h1>{t("login.tagline")}</h1>
    <p>{t("login.intro")}</p>
    {deleted && <p className="form-success" role="status">{t("login.accountDeleted")}</p>}
    {deletedPartial && <p className="form-warning" role="status">{t("login.accountDeletedPartial")}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <ProviderButtons next={next} providers={providers} />
    <LoginForm next={next} />
    <nav className="auth-footer" aria-label={t("login.information")}>
      <a href="/">{t("login.backHome")}</a>
      <a href="/confidentialite">{t("home.footer.privacy")}</a>
      <a href="/mentions-legales">{t("home.footer.legal")}</a>
    </nav>
  </div></main>;
}
