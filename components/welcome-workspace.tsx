import { logout } from "@/app/login/actions";
import { PendingSubmit } from "@/components/pending-submit";
import { getTranslations } from "@/lib/i18n/server";
import { WelcomeForm } from "@/components/welcome-form";
import { saveProfile } from "@/app/bienvenue/actions";
import type { Profile } from "@/lib/profile/profile";
export async function WelcomeWorkspace({ email, profile }: { email: string; profile: Profile | null }) {
  const t = await getTranslations();
  return <main className="shell welcome-shell">
    <div className="welcome-card">
      <a className="welcome-brand brand-link" href="/compte">clair.</a>
      <p className="welcome-step">{t("welcome.step")}</p>
      <h1>{t("welcome.title")}</h1>
      <p className="welcome-lead">{t("welcome.lead")}</p>
      <ol className="welcome-next"><li>{t("welcome.nextProfile")}</li><li>{t("welcome.nextBank")}</li><li>{t("welcome.nextExplore")}</li></ol>
      <WelcomeForm profile={profile} onSubmit={saveProfile} submitLabel={t("welcome.submit")} />
      <div className="welcome-exit"><a href="/compte">{t("account.title")}</a><form action={logout}><PendingSubmit className="text-button">{t("nav.signOut")}</PendingSubmit></form></div>
      <p className="welcome-account">{t("welcome.signedInAs", { email: email })}</p>
    </div>
  </main>;
}
