"use client";

import { useActionState, useState } from "react";
import { requestPasswordReset, signInWithPassword, signUpWithPassword, type LoginState } from "@/app/login/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { useTranslate } from "@/components/i18n-provider";

const initialState: LoginState = {};

type Mode = "signin" | "signup" | "reset";

const ACTIONS = {
  signin: signInWithPassword,
  signup: signUpWithPassword,
  reset: requestPasswordReset
} as const;



/**
 * Connexion, création de compte et réinitialisation, dans un seul formulaire.
 *
 * Trois écrans distincts obligeraient à ressaisir l'adresse à chaque changement d'avis — or on
 * ne sait pas toujours, en arrivant, si l'on a déjà un compte. Le champ email reste en place.
 *
 * Le lien magique a disparu : il imposait un aller-retour par email à chaque appareil. L'email
 * n'a pas disparu pour autant, il sert désormais à ce pour quoi il est irremplaçable —
 * confirmer qu'une adresse appartient bien à qui s'inscrit, et rouvrir un compte dont le mot de
 * passe est oublié.
 */
export function LoginForm({ next }: { next?: string }) {
  const t = useTranslate();
  const [mode, setMode] = useState<Mode>("signin");
  const [state, action, pending] = useActionState(
    async (previous: LoginState, formData: FormData) => ACTIONS[mode](previous, formData),
    initialState
  );
  const submit: Record<Mode, [string, string]> = {
    signin: [t("login.action.signIn"), t("login.action.signingIn")],
    signup: [t("login.action.signUp"), t("login.action.signingUp")],
    reset: [t("login.action.sendLink"), t("login.action.sendingLink")]
  };
  const [label, busyLabel] = submit[mode];

  return <form action={action} className="auth-form">
    {next && <input type="hidden" name="next" value={next} />}

    <label htmlFor="email">{t("login.field.email")}</label>
    <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder={t("login.field.emailPlaceholder")} />

    {mode !== "reset" && <>
      <label htmlFor="password">{t("login.field.password")}</label>
      <input
        id="password"
        name="password"
        type="password"
        // Indique au gestionnaire de mots de passe s'il doit en proposer un nouveau ou remplir
        // celui qu'il connaît. Sans cette distinction, il propose souvent l'inverse.
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        required
        minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
        placeholder={mode === "signup" ? t("login.field.passwordPlaceholder", { count: MIN_PASSWORD_LENGTH }) : undefined}
      />
    </>}

    <button className="primary" disabled={pending}>{pending ? busyLabel : label}</button>

    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.message && <p className="form-success" role="status">{state.message}</p>}

    <div className="auth-switch">
      {mode === "signin" && <>
        <button type="button" className="text-link" disabled={pending} onClick={() => setMode("signup")}>{t("login.switch.toSignUp")}</button>
        <button type="button" className="text-link" disabled={pending} onClick={() => setMode("reset")}>{t("login.switch.toReset")}</button>
      </>}
      {mode === "signup" && <button type="button" className="text-link" disabled={pending} onClick={() => setMode("signin")}>{t("login.switch.haveAccount")}</button>}
      {mode === "reset" && <button type="button" className="text-link" disabled={pending} onClick={() => setMode("signin")}>{t("login.switch.backToSignIn")}</button>}
    </div>
  </form>;
}
