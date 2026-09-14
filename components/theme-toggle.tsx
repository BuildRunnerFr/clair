"use client";

import { useEffect, useState } from "react";
import { useTranslate } from "@/components/i18n-provider";

/**
 * Le choix du thème : clair, sombre, ou celui du système.
 *
 * Trois états et non deux. Un simple interrupteur oblige à trancher une fois pour toutes, alors
 * que la plupart des gens veulent surtout que l'application suive leur téléphone — sombre le
 * soir, clair le jour — sans avoir à y penser. « Système » est donc le défaut, et les deux
 * autres positions sont là pour ceux que ce réglage ne satisfait pas.
 *
 * Le choix vit dans le navigateur et non en base : c'est une préférence d'écran, pas une donnée
 * du compte, et l'écrire côté serveur obligerait à un aller-retour avant de peindre la page.
 * Un même compte ouvert sur deux appareils garde ainsi un réglage propre à chacun, ce qui est
 * le comportement attendu.
 *
 * L'application effective se fait avant la peinture, par le script du gabarit : ici on ne fait
 * que refléter et modifier. Poser l'attribut depuis un effet ferait apparaître la page en clair
 * une fraction de seconde avant de basculer — un clignotement blanc en pleine nuit.
 */

const MODES = ["light", "dark", "system"] as const;
type Mode = (typeof MODES)[number];

export const THEME_STORAGE_KEY = "clair.theme";

function isMode(value: unknown): value is Mode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

export function ThemeToggle() {
  const t = useTranslate();
  // « system » au premier rendu, comme le serveur : toute autre valeur ferait diverger le HTML
  // rendu côté serveur de celui du navigateur, et React signalerait l'écart.
  const [mode, setMode] = useState<Mode>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (isMode(stored)) setMode(stored);
    } catch {
      // Navigation privée, stockage refusé : le réglage du système reste, et il est correct.
    }
    setReady(true);
  }, []);

  function choose(next: Mode) {
    setMode(next);
    const root = document.documentElement;
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* sans persistance, le choix vaut pour la session */ }
  }

  return <div className="theme-toggle" role="group" aria-label={t("theme.label")}>
    {MODES.map((option) => <button
      key={option}
      type="button"
      className="theme-option"
      // Avant l'hydratation aucune position n'est annoncée comme choisie : en désigner une au
      // hasard afficherait un état faux le temps que le vrai réglage soit lu.
      aria-pressed={ready ? option === mode : undefined}
      onClick={() => choose(option)}
      title={t(`theme.${option}`)}
    >
      <span aria-hidden="true">{option === "light" ? "☀" : option === "dark" ? "☾" : "◐"}</span>
      <span className="visually-hidden">{t(`theme.${option}`)}</span>
    </button>)}
  </div>;
}
