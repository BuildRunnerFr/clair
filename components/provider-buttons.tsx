"use client";

import { useActionState } from "react";
import { signInWithProvider } from "@/app/login/actions";
import { useTranslate } from "@/components/i18n-provider";
import type { LoginState } from "@/app/login/actions";
import type { OAuthProvider } from "@/lib/auth/oauth";

const initialState: LoginState = {};

/**
 * Connexion par fournisseur, mise avant le mot de passe.
 *
 * La liste vient du serveur, qui la tient de Supabase : voir lib/auth/providers.ts. Un bouton
 * affiché ici est un bouton dont la redirection aboutit.
 *
 * L'ordre n'est pas neutre : c'est le chemin le plus court pour presque tout le monde, et il
 * évite l'aller-retour par email que le lien magique impose sur chaque nouvel appareil. Le lien
 * magique reste dessous, pour qui n'a ni compte Google ni compte Apple.
 *
 * Les marques sont dessinées en SVG plutôt que chargées : leurs conditions d'utilisation
 * imposent le logo officiel, et une icône distante ajouterait une dépendance réseau au seul
 * écran qui doit fonctionner quand rien d'autre ne fonctionne encore.
 */
const MARKS: Record<OAuthProvider, { label: string; mark: () => React.JSX.Element }> = {
  google: { label: "Google", mark: GoogleMark },
  apple: { label: "Apple", mark: AppleMark }
};

export function ProviderButtons({ next, providers }: { next?: string; providers: OAuthProvider[] }) {
  const t = useTranslate();
  const [state, action, pending] = useActionState(
    async (_state: LoginState, formData: FormData) => signInWithProvider(formData),
    initialState
  );

  // Aucun fournisseur actif : le formulaire par mot de passe se suffit, et le séparateur
  // « ou avec un mot de passe » n'a plus rien à séparer.
  if (!providers.length) return null;

  return <div className="provider-group">
    <form action={action} className="provider-form">
      {next && <input type="hidden" name="next" value={next} />}
      {providers.map((provider) => {
        const { label, mark: Mark } = MARKS[provider];
        return <button key={provider} className="provider-button" name="provider" value={provider} disabled={pending}>
          <Mark />
          <span>{t("login.provider.continueWith", { provider: label })}</span>
        </button>;
      })}
    </form>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    <div className="provider-divider"><span>{t("login.provider.orPassword")}</span></div>
  </div>;
}

function GoogleMark() {
  return <svg className="provider-mark" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
    <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
  </svg>;
}

function AppleMark() {
  return <svg className="provider-mark" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M12.28 9.53c-.02-1.9 1.55-2.81 1.62-2.86-.88-1.29-2.26-1.47-2.75-1.49-1.17-.12-2.29.69-2.88.69-.6 0-1.51-.67-2.48-.66-1.28.02-2.46.74-3.12 1.89-1.33 2.3-.34 5.71.96 7.58.64.91 1.39 1.94 2.38 1.9.96-.04 1.32-.62 2.47-.62 1.15 0 1.48.62 2.48.6 1.03-.02 1.68-.93 2.3-1.85.73-1.06 1.03-2.09 1.05-2.14-.02-.01-2.01-.77-2.03-3.05ZM10.4 3.7c.53-.64.89-1.53.79-2.42-.76.03-1.69.51-2.24 1.15-.49.56-.92 1.47-.8 2.34.85.07 1.72-.43 2.25-1.07Z" />
  </svg>;
}
