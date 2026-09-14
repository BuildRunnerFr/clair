"use client";

import { useActionState } from "react";
import { updatePassword, type PasswordState } from "@/app/compte/mot-de-passe/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { useTranslate } from "@/components/i18n-provider";

const initialState: PasswordState = {};

/**
 * Saisie d'un nouveau mot de passe, en double.
 *
 * La confirmation n'est pas une formalité ici : le champ est masqué, et une faute de frappe
 * enfermerait dehors quelqu'un qui vient précisément de récupérer son accès.
 */
export function PasswordForm() {
  const t = useTranslate();
  const [state, action, pending] = useActionState(updatePassword, initialState);

  return <form action={action} className="auth-form password-form">
    <label htmlFor="password">{t("password.new")}</label>
    <input
      id="password"
      name="password"
      type="password"
      autoComplete="new-password"
      required
      minLength={MIN_PASSWORD_LENGTH}
      placeholder={t("login.field.passwordPlaceholder", { count: MIN_PASSWORD_LENGTH })}
    />

    <label htmlFor="confirmation">{t("password.confirm")}</label>
    <input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} />

    <button className="primary" disabled={pending}>{pending ? t("password.saving") : t("password.save")}</button>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
  </form>;
}
