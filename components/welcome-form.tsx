"use client";

import { useActionState } from "react";
import { Select } from "@/components/select";
import { useTranslate } from "@/components/i18n-provider";
import type { WelcomeState } from "@/app/bienvenue/actions";
import { COUNTRIES, GENDERS, type Profile } from "@/lib/profile/profile";

/**
 * Ce qu'on demande à quelqu'un qui vient d'arriver.
 *
 * Cinq champs, dont deux obligatoires. L'ordre suit l'utilité décroissante : le prénom, qui sert
 * dès l'écran suivant, puis le pays, qui décide des banques proposées, puis ce qui peut attendre.
 * Chaque champ facultatif dit à quoi il sert — un formulaire qui demande une date de naissance
 * sans expliquer pourquoi donne l'impression de collectionner, pas de servir.
 */
export function WelcomeForm({ profile, onSubmit, submitLabel, showPrivacy = true }: {
  profile: Profile | null;
  onSubmit: (previous: WelcomeState, formData: FormData) => Promise<WelcomeState>;
  submitLabel: string;
  /** La mention de confidentialité n'a de sens qu'à la première demande. */
  showPrivacy?: boolean;
}) {
  const t = useTranslate();
  const [state, action, pending] = useActionState<WelcomeState, FormData>(onSubmit, {});

  return <form action={action} className="welcome-form">
    <label className="field">
      <span>{t("welcome.firstName")}</span>
      <input name="firstName" required maxLength={80} autoComplete="given-name" defaultValue={profile?.firstName ?? ""}/>
    </label>

    <div className="field-with-hint">
      <Select name="country" label={t("welcome.country")} value={profile?.country ?? ""}
        options={[{ value: "", label: t("welcome.countryPlaceholder") }, ...COUNTRIES.map((country) => ({ value: country.code, label: country.name }))]} />
      <small className="field-hint">{t("welcome.countryHint")}</small>
    </div>

    <details className="profile-optional">
      <summary>{t("welcome.optionalDetails")}</summary>
      <p className="hint">{t("welcome.optionalHint")}</p>
      <label className="field"><span>{t("welcome.lastName")}</span><input name="lastName" maxLength={80} autoComplete="family-name" defaultValue={profile?.lastName ?? ""}/><small className="field-hint">{t("welcome.lastNameHint")}</small></label>
    <div className="welcome-row">
      <label className="field">
        <span>{t("welcome.birthDate")}</span>
        <input name="birthDate" type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={profile?.birthDate ?? ""} />
        <small className="field-hint">{t("welcome.birthDateHint")}</small>
      </label>
      <div className="field-with-hint">
        <Select name="gender" label={t("welcome.gender")} value={profile?.gender ?? ""}
          options={[{ value: "", label: t("welcome.genderSkip") },
            ...GENDERS.filter((value) => value !== "undisclosed").map((value) => ({ value, label: t(`welcome.gender.${value}`) })),
            { value: "undisclosed", label: t("welcome.gender.undisclosed") }]} />
        <small className="field-hint">{t("welcome.genderHint")}</small>
      </div>
    </div>

    </details>

    {state.error && <p className="bank-error" role="alert">{t(`welcome.error.${state.error}`)}</p>}

    <button className="primary" disabled={pending}>{pending ? t("welcome.saving") : submitLabel}</button>
    {showPrivacy && <p className="hint">{t("welcome.privacy")} <a href="/confidentialite">{t("welcome.privacyLink")}</a></p>}
  </form>;
}
