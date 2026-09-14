import { Select } from "@/components/select";
import { AppHeader } from "@/components/app-header";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { PROVIDER_LABELS, type OAuthProvider } from "@/lib/auth/oauth";
import { getTranslations, currentLocale } from "@/lib/i18n/server";
import { replayOnboarding } from "@/app/dashboard/onboarding-actions";
import { LOCALES, intlLocale } from "@/lib/i18n/catalogue";
import { AutoSubmit } from "@/components/auto-submit";
import { setLocale } from "@/app/compte/locale-actions";
import { logout } from "@/app/login/actions";
import { WelcomeForm } from "@/components/welcome-form";
import { updateProfile } from "@/app/compte/profile-actions";
import { COUNTRIES } from "@/lib/profile/profile";
import { ThemeToggle } from "@/components/theme-toggle";

import type { Profile } from "@/lib/profile/profile";
import type { BankConnection } from "@/types/banking";
const METHOD_LABELS: Record<string, string> = { email: "Email", ...PROVIDER_LABELS };
export async function AccountWorkspace({ email, profile, methods, connections, passwordSaved = false, profileSaved = false }: {
  email: string; profile: Profile | null; methods: string[]; connections: BankConnection[];
  passwordSaved?: boolean; profileSaved?: boolean;
}) {
  const t = await getTranslations();
  const locale = await currentLocale();
  const country = COUNTRIES.find((item) => item.code === profile?.country);
  const birth = profile?.birthDate
    ? new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }).format(new Date(`${profile.birthDate}T12:00:00Z`))
    : null;

  return <main className="shell">
    <AppHeader email={email} firstName={profile?.firstName} current="/compte" />
    <h1>{t("account.title")}</h1>
    <p className="intro">{t("account.intro")}</p>
    {passwordSaved && <p className="form-success" role="status">{t("account.passwordSaved")}</p>}
    {profileSaved && <p className="form-success" role="status">{t("account.profileSaved")}</p>}

    <div className="grid account-grid">
      <article className="card wide" id="profil">
        <h2>{t("account.profile")}</h2>
        <p className="hint account-hint">{t("account.profileHint")}</p>
        <WelcomeForm profile={profile} onSubmit={updateProfile} submitLabel={t("account.editProfile")} showPrivacy={false} />
      </article>

      <article className="card side">
        <h2>{t("account.identity")}</h2>
        <dl className="detail-list">
          <div><dt>{t("account.emailAddress")}</dt><dd>{email}</dd></div>
          <div>
            <dt>{t("account.methods")}</dt>
            <dd>{methods.length
              ? methods.map((method) => METHOD_LABELS[method as OAuthProvider] ?? method).join(" · ")
              : "—"}</dd>
          </div>
          <div><dt>{t("welcome.country")}</dt><dd>{country?.name ?? t("account.notProvided")}</dd></div>
          <div><dt>{t("welcome.birthDate")}</dt><dd>{birth ?? t("account.notProvided")}</dd></div>
        </dl>
        <p className="hint">{t("account.methodsHint")}</p>
        <div className="account-actions">
          <a className="small-button" href="/compte/mot-de-passe">{methods.includes("email") ? t("account.changePassword") : t("account.setPassword")}</a>
          {/* La déconnexion vit ici parce que l'en-tête ne la porte plus sur téléphone : à trois
              éléments, il dépassait la largeur de l'écran. Sa place est de toute façon avec les
              autres actions de compte. */}
          <form action={logout}><button className="small-button">{t("nav.signOut")}</button></form>
          {/* La présentation reste rejouable : la donner une fois puis la rendre introuvable
              revient à la réserver à ceux qui n'en avaient pas besoin. */}
          <form action={replayOnboarding}><button className="small-button">{t("account.replayTour")}</button></form>
        </div>
      </article>

      <article className="card wide">
        <h2>{t("account.bankData")}</h2>
        <dl className="detail-list">
          <div><dt>{t("account.banksConnected")}</dt><dd>{connections.length}</dd></div>
          <div><dt>{t("account.accountsTracked")}</dt><dd>{connections.reduce((total, item) => total + item.accountCount, 0)}</dd></div>
        </dl>
        <p className="hint">{t("account.bankHint")}</p>
        <ul className="account-banks">{connections.map(connection => <li key={connection.id}><span>{connection.displayName ?? "Banque"}</span><span>{t(connection.status === "active" ? "account.bankActive" : "account.bankAttention")}</span></li>)}</ul>
        <a className="small-button" href="/dashboard">{t("account.manageBanks")}</a>
      </article>

      <article className="card side">
        <h2>{t("account.display")}</h2>
        {/* Une liste déroulante qui s'applique seule : un bouton « Appliquer » supplémentaire
            pour un choix binaire ferait douter qu'il ait été pris en compte. */}
        <form action={setLocale} className="locale-form">
          <Select name="locale" label={t("account.language")} value={locale}
            options={LOCALES.map((code) => ({ value: code, label: t(`language.${code}`) }))} />
          <button className="small-button">{t("account.languageApply")}</button>
          <AutoSubmit only="select" />
        </form>
        <p className="hint">{t("account.languageHint")}</p>
        {/* Le sélecteur de thème vit aussi ici. Dans l'en-tête d'un téléphone, ses trois cibles
            tactiles occupaient cent quarante pixels sur trois cent quatre-vingt-dix — plus que
            tout le reste réuni, pour un réglage qu'on choisit une fois. */}
        <div className="appearance-row">
          <span className="hint appearance-label">{t("theme.label")}</span>
          <ThemeToggle />
        </div>
      </article>

      <article className="card full danger-zone"><details><summary>{t("account.deleteTitle")}</summary>
        <div className="card-heading"><div className="label label-danger">{t("account.deleteTitle")}</div></div>
        <p>{t("account.deleteWarning")} <strong>{t("account.deleteIrreversible")}</strong></p>
        <DeleteAccountForm email={email} />
        </details>
      </article>
    </div>
  </main>;
}
