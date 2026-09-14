"use client";

import { useEffect, useState } from "react";
import { useTranslate } from "@/components/i18n-provider";
import { completeOnboarding } from "@/app/dashboard/onboarding-actions";

/**
 * La visite guidée du tableau de bord.
 *
 * Elle éclaire une section à la fois et estompe le reste. La première version décrivait les
 * écrans dans une fenêtre : c'était plus sûr à construire, et cela demandait à l'utilisateur
 * d'imaginer ce qu'on lui décrivait — exactement le travail qu'une visite doit lui épargner.
 *
 * Le procédé habituel, un projecteur positionné en JavaScript sur les coordonnées de la cible,
 * est fragile : il se décale au redimensionnement, à l'ouverture du clavier sur mobile, à tout
 * changement de mise en page, et finit par éclairer du vide.
 *
 * Ici, rien n'est calculé. Un attribut posé sur la page suffit, et le CSS fait le reste : tout
 * ce qui porte `data-tour` s'estompe, sauf ce qui correspond à l'étape en cours. Le repère suit
 * l'élément où qu'il aille, puisque c'est l'élément lui-même qui s'éclaire.
 */

const STEPS = ["metrics", "balances", "flows", "categories", "budgets", "subscriptions", "nav", "bank"] as const;
type Step = (typeof STEPS)[number];

export function GuidedTour() {
  const t = useTranslate();
  const [index, setIndex] = useState(0);
  const [closing, setClosing] = useState(false);
  const step: Step = STEPS[index]!;
  const last = index === STEPS.length - 1;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.tourStep = step;
    // Amener la section éclairée sous les yeux : sur un écran court, elle serait sinon hors du
    // cadre et l'utilisateur ne verrait qu'un voile.
    const target = document.querySelector<HTMLElement>(`[data-tour="${step}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    return () => { delete root.dataset.tourStep; };
  }, [step]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") void finish();
      if (event.key === "ArrowRight" && !last) setIndex((current) => current + 1);
      if (event.key === "ArrowLeft" && index > 0) setIndex((current) => current - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  async function finish() {
    if (closing) return;
    setClosing(true);
    delete document.documentElement.dataset.tourStep;
    await completeOnboarding();
  }

  return <div className="tour" role="dialog" aria-live="polite" aria-label={t("onboarding.dialogLabel")}>
    <div className="tour-card">
      <p className="tour-progress">{t("onboarding.progress", { current: index + 1, total: STEPS.length })}</p>
      <h2>{t(`tour.${step}.title`)}</h2>
      <p className="tour-body">{t(`tour.${step}.body`)}</p>

      <div className="tour-actions">
        <button type="button" className="text-button" onClick={finish} disabled={closing}>{t("onboarding.skip")}</button>
        <div className="tour-nav">
          {index > 0 && <button type="button" className="secondary-plain" onClick={() => setIndex(index - 1)}>{t("onboarding.back")}</button>}
          <button type="button" className="primary" onClick={() => last ? void finish() : setIndex(index + 1)} disabled={closing}>
            {last ? t("onboarding.finish") : t("onboarding.next")}
          </button>
        </div>
      </div>

      <ol className="tour-dots" aria-hidden="true">
        {STEPS.map((key, position) => <li key={key} className={position === index ? "is-current" : undefined} />)}
      </ol>
    </div>
  </div>;
}
