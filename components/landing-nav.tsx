"use client";

import { useEffect, useState } from "react";

/**
 * La navigation du site vitrine, qui suit la lecture.
 *
 * Trois ancres pointent vers des sections situées à plusieurs écrans de distance. Sans repère,
 * on clique, la page saute, et rien ne dit où l'on a atterri ni ce qu'on vient de quitter — le
 * défilement doux règle le saut, pas le repérage. La rubrique en cours se souligne donc, et le
 * lien devient sa propre indication de position.
 *
 * Un écouteur de défilement plutôt qu'un IntersectionObserver : la question posée n'est pas
 * « cette section est-elle visible » — plusieurs le sont toujours — mais « laquelle a passé la
 * ligne de lecture en dernier », qui se lit directement sur les positions et n'a aucun cas
 * limite en haut de page, là où aucune section n'a encore été franchie.
 */
export function LandingNav({ items }: { items: Array<{ href: string; label: string }> }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let queued = false;
    const measure = () => {
      queued = false;
      // Un peu au-dessus du milieu : la rubrique change quand son titre entre dans le champ,
      // pas quand il l'a traversé.
      const line = window.innerHeight * 0.42;
      // La rubrique retenue est la dernière franchie, c'est-à-dire celle dont le haut est le
      // plus bas parmi ceux qui sont passés. Retenir simplement la dernière de la liste
      // supposerait que l'ordre des liens suive l'ordre du document — ce qu'il ne fait pas, la
      // barre plaçant les banques en fin de menu et la page les plaçant en tête.
      let current: string | null = null;
      let nearest = -Infinity;
      for (const { href } of items) {
        const target = document.querySelector(href);
        if (!target) continue;
        const top = target.getBoundingClientRect().top;
        if (top <= line && top > nearest) { nearest = top; current = href; }
      }
      setActive(current);
      // La barre collante ne prend son ombre qu'une fois qu'elle a du contenu à recouvrir.
      document.documentElement.dataset.landingScrolled = window.scrollY > 8 ? "true" : "false";
    };
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(measure); } };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      delete document.documentElement.dataset.landingScrolled;
    };
  }, [items]);

  return <nav className="landing-nav">
    {items.map((item) => <a key={item.href} href={item.href} aria-current={active === item.href ? "true" : undefined}>
      {item.label}
    </a>)}
  </nav>;
}
