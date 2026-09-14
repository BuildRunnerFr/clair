"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslate } from "@/components/i18n-provider";

/**
 * Replie la barre de filtres sur un téléphone, et seulement là.
 *
 * Quatre champs coûtaient cent quatre-vingt-huit pixels en tête du tableau de bord — sur l'écran
 * dont le métier est de répondre « combien j'ai » sans qu'on ait à défiler. Or on ne filtre pas
 * à chaque visite : le mois en cours et tous les comptes sont ce qu'on veut voir neuf fois sur
 * dix. Ce qui sert rarement n'a pas à occuper le premier tiers de la page.
 *
 * Le repli se fait par une classe posée sur le formulaire, et non par un `details` : forcer
 * l'ouverture d'un `details` sur grand écran demande `display: contents` ou `::details-content`,
 * deux mécanismes dont je ne peux pas vérifier le comportement sur tous les moteurs. Ici, sans
 * JavaScript, la barre reste telle qu'elle a toujours été — l'effet ne fait que replier, jamais
 * déplier.
 */
export function FilterCollapse({ summary, activeCount }: { summary: string; activeCount: number }) {
  const marker = useRef<HTMLSpanElement>(null);
  const [form, setForm] = useState<HTMLFormElement | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const found = marker.current?.closest("form");
    if (!found) return;
    // La largeur est lue une fois : une rotation d'écran est assez rare pour ne pas justifier
    // d'écouter en continu, et rien ne casse si l'état ne suit pas — les champs restent
    // atteignables par le bouton.
    if (!window.matchMedia("(max-width: 560px)").matches) return;
    found.dataset.collapsed = "on";
    setForm(found);
    setOpen(false);
  }, []);

  function toggle() {
    if (!form) return;
    const next = !open;
    setOpen(next);
    if (next) delete form.dataset.collapsed;
    else form.dataset.collapsed = "on";
  }

  const t = useTranslate();
  return <>
    <span ref={marker} hidden />
    {form && <button type="button" className="filter-toggle" onClick={toggle} aria-expanded={open}>
      <span className="filter-toggle-label">{t(open ? "dashboard.filtersHide" : "dashboard.filtersShow")}</span>
      <span className="filter-toggle-value">{summary}</span>
      {/* Un compteur quand un filtre est posé au-delà du mois : replié, rien ne disait que les
          chiffres affichés ne portaient que sur une catégorie ou un compte, et on cherche
          longtemps pourquoi un total ne ressemble pas à ce qu'on attendait. */}
      {activeCount > 0 && <span className="filter-toggle-count">{activeCount}</span>}
    </button>}
  </>;
}
