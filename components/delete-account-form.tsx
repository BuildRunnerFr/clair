"use client";

import { useActionState, useState } from "react";
import { deleteAccount, type DeleteAccountState } from "@/app/compte/actions";
import { useTranslate } from "@/components/i18n-provider";

const initialState: DeleteAccountState = {};

/**
 * Suppression de compte, en deux gestes délibérés.
 *
 * Le formulaire reste replié tant qu'on ne l'ouvre pas, puis demande l'adresse recopiée. Ni
 * l'un ni l'autre n'est un obstacle sérieux — le but n'est pas d'empêcher, c'est d'exclure le
 * geste distrait. Un simple bouton rouge se clique sans lire.
 *
 * Le bouton reste désactivé tant que l'adresse ne correspond pas : l'erreur se voit avant
 * l'envoi plutôt qu'après, et il n'y a rien à corriger dans un formulaire qu'on ne peut pas
 * soumettre par erreur. Le serveur revérifie de toute façon — cette vérification-ci n'est
 * qu'un confort d'affichage.
 */
export function DeleteAccountForm({ email }: { email: string }) {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState(deleteAccount, initialState);
  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase() && email !== "";

  if (!open) {
    return <button className="danger-button" onClick={() => setOpen(true)}>{t("account.deleteStart")}</button>;
  }

  return <form action={action} className="delete-form">
    <label htmlFor="confirmation">{t("account.deleteConfirmPrompt")} <strong>{email}</strong></label>
    <input
      id="confirmation"
      name="confirmation"
      type="email"
      autoComplete="off"
      spellCheck={false}
      placeholder={email}
      value={typed}
      onChange={(event) => setTyped(event.target.value)}
      required
    />
    <div className="delete-actions">
      <button className="danger-button" disabled={!matches || pending}>
        {pending ? t("account.deleting") : t("account.deleteConfirm")}
      </button>
      <button type="button" className="text-button" onClick={() => { setOpen(false); setTyped(""); }} disabled={pending}>
        {t("account.cancel")}
      </button>
    </div>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
  </form>;
}
