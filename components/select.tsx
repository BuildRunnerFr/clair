"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Une liste de choix, à la place du menu natif.
 *
 * Le menu natif est robuste et je ne l'aurais pas remplacé de moi-même — mais il se comporte mal
 * là où il compte : sur plusieurs systèmes il faut maintenir le bouton enfoncé pour parcourir
 * les options, et il ne se laisse habiller ni en clair ni en sombre. Celui-ci s'ouvre d'un
 * appui, se referme au choix, et porte le thème de l'application.
 *
 * Ce que le natif donnait gratuitement doit être rendu à la main, faute de quoi on aura échangé
 * une gêne contre une régression :
 *
 * — Le clavier. Flèches pour parcourir, Origine et Fin pour les extrémités, Entrée pour choisir,
 *   Échap pour renoncer, et la saisie au vol — taper « res » atteint Restaurants. C'est ainsi
 *   qu'on se sert d'une liste sans souris, et c'est la première chose qu'un menu fait maison
 *   perd.
 * — Le focus ne quitte jamais le bouton : l'option courante est désignée par
 *   `aria-activedescendant`. Déplacer le focus dans la liste oblige à le remettre au bon endroit
 *   à la fermeture, et c'est là que les lecteurs d'écran décrochent.
 * — La valeur part dans un champ caché. Les filtres de l'application sont des formulaires GET
 *   ordinaires ; sans lui, choisir ne filtrerait plus rien.
 */
export function Select({ name, value, options, label, onChange, disabled }: {
  name: string;
  value: string;
  options: SelectOption[];
  label: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  const [choisi, setChoisi] = useState(value);
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const conteneur = useRef<HTMLDivElement>(null);
  const liste = useRef<HTMLUListElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const frappe = useRef({ texte: "", horloge: 0 });
  const identifiant = useId().replace(/:/g, "");

  // Le parent peut changer la valeur — remise à zéro d'un filtre, navigation arrière.
  useEffect(() => setChoisi(value), [value]);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (event: PointerEvent) => {
      if (!conteneur.current?.contains(event.target as Node)) setOuvert(false);
    };
    document.addEventListener("pointerdown", dehors);
    return () => document.removeEventListener("pointerdown", dehors);
  }, [ouvert]);

  // L'option courante doit être visible quand la liste s'ouvre sur un choix lointain.
  useEffect(() => {
    if (!ouvert) return;
    liste.current?.querySelector('[data-actif="true"]')?.scrollIntoView({ block: "nearest" });
  }, [ouvert, actif]);

  const courant = options.find((option) => option.value === choisi) ?? options[0];

  function choisir(index: number) {
    const option = options[index];
    if (!option) return;
    setChoisi(option.value);
    setOuvert(false);
    onChange?.(option.value);
    /**
     * Un vrai événement « change », émis depuis le champ caché.
     *
     * Les barres de filtres s'appliquent d'elles-mêmes en écoutant cet événement sur le
     * formulaire — c'est ce que faisait le menu natif. Une valeur posée par React n'en émet
     * aucun : sans cette ligne, choisir une catégorie ne filtrerait plus rien tant qu'on
     * n'appuie pas sur le bouton, et la régression serait silencieuse.
     */
    queueMicrotask(() => champ.current?.dispatchEvent(new Event("change", { bubbles: true })));
  }

  function ouvrir() {
    setActif(Math.max(0, options.findIndex((option) => option.value === choisi)));
    setOuvert(true);
  }

  function auClavier(event: React.KeyboardEvent) {
    if (disabled) return;
    const touche = event.key;
    if (!ouvert && (touche === "Enter" || touche === " " || touche === "ArrowDown" || touche === "ArrowUp")) {
      event.preventDefault();
      return ouvrir();
    }
    if (!ouvert) return;
    if (touche === "Escape") { event.preventDefault(); return setOuvert(false); }
    if (touche === "Enter" || touche === " ") { event.preventDefault(); return choisir(actif); }
    if (touche === "ArrowDown") { event.preventDefault(); return setActif((index) => Math.min(index + 1, options.length - 1)); }
    if (touche === "ArrowUp") { event.preventDefault(); return setActif((index) => Math.max(index - 1, 0)); }
    if (touche === "Home") { event.preventDefault(); return setActif(0); }
    if (touche === "End") { event.preventDefault(); return setActif(options.length - 1); }
    if (touche.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      // Saisie au vol : les frappes rapprochées s'accumulent, une pause repart de zéro.
      const maintenant = Date.now();
      frappe.current.texte = maintenant - frappe.current.horloge > 700 ? touche : frappe.current.texte + touche;
      frappe.current.horloge = maintenant;
      const cible = options.findIndex((option) => option.label.toLowerCase().startsWith(frappe.current.texte.toLowerCase()));
      if (cible >= 0) setActif(cible);
    }
  }

  return <label className="field">
    <span>{label}</span>
    <div className={`select-shell${ouvert ? " select-open" : ""}`} ref={conteneur}>
      <input ref={champ} type="hidden" name={name} value={choisi} data-select="true" />
      <button
        type="button"
        className="select-button"
        role="combobox"
        aria-expanded={ouvert}
        aria-controls={`liste-${identifiant}`}
        aria-activedescendant={ouvert ? `option-${identifiant}-${actif}` : undefined}
        disabled={disabled}
        onClick={() => (ouvert ? setOuvert(false) : ouvrir())}
        onKeyDown={auClavier}
      >
        <span className="select-value">{courant?.label ?? ""}</span>
      </button>
      {ouvert && <ul className="select-list" id={`liste-${identifiant}`} role="listbox" ref={liste}>
        {options.map((option, index) => <li
          key={option.value}
          id={`option-${identifiant}-${index}`}
          role="option"
          aria-selected={option.value === choisi}
          data-actif={index === actif}
          onPointerDown={(event) => { event.preventDefault(); choisir(index); }}
          onPointerEnter={() => setActif(index)}
        >{option.label}</li>)}
      </ul>}
    </div>
  </label>;
}
