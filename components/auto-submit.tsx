"use client";

import { useEffect, useRef } from "react";

/**
 * Applies a filter form as soon as a control changes, removing the extra click that every
 * adjustment used to cost.
 *
 * Progressive enhancement, deliberately: the form still works as a plain GET form when this
 * never runs. The submit button is only hidden once this component has mounted, so a visitor
 * without JavaScript keeps the control that submits for them.
 */
export function AutoSubmit({ only }: { only?: "select" } = {}) {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;
    if (only !== "select") form.dataset.autoSubmit = "on";
    // "change" only, never "input": a month field fires input on every spinner step, which
    // would navigate on each partial value.
    // `only="select"` sert aux formulaires portant un champ de recherche : appliquer à chaque
    // frappe relancerait une requête par caractère, alors qu'une liste déroulante ne change
    // qu'une fois.
    const submit = (event: Event) => {
      // Les listes de choix de l'application ne sont plus des <select> natifs : elles portent
      // un champ caché marqué, d'où le second test. Sans lui, seuls les menus natifs restants
      // déclencheraient l'envoi, et le filtre paraîtrait ignoré une fois sur deux.
      const estUneListe = event.target instanceof HTMLSelectElement
        || (event.target instanceof HTMLInputElement && event.target.dataset.select === "true");
      if (only === "select" && !estUneListe) return;
      form.requestSubmit();
    };
    form.addEventListener("change", submit);
    return () => {
      form.removeEventListener("change", submit);
      delete form.dataset.autoSubmit;
    };
  }, [only]);

  return <span ref={marker} hidden />;
}
