import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/lib/auth/user";
import { PasswordForm } from "@/components/password-form";
import { getTranslations } from "@/lib/i18n/server";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Mot de passe" };

export default async function PasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, profile } = await requireUser({ allowIncompleteProfile: true });
  const t = await getTranslations();
  const params = await searchParams;
  const afterReset = params.reset === "1";

  return <main className="shell">
    <AppHeader email={user.email ?? "votre compte"} firstName={profile?.firstName} current="/compte" />
    <h1>{afterReset ? t("password.titleAfterReset") : t("password.title")}</h1>
    <p className="intro">{afterReset ? t("password.introAfterReset") : t("password.intro")}</p>

    <div className="grid">
      <article className="card wide">
        <div className="label">{t("password.new")}</div>
        <PasswordForm />
      </article>
    </div>
  </main>;
}
