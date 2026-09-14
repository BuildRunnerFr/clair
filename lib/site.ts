import type { Metadata } from "next";

/**
 * L'adresse canonique du site, et la frontière entre ce qui s'explore et ce qui ne s'explore pas.
 *
 * L'adresse est écrite en dur plutôt que déduite de `VERCEL_URL`, et c'est délibéré : chaque
 * déploiement de prévisualisation reçoit son propre domaine, et une adresse canonique qui
 * suivrait cette variable ferait déclarer à une prévisualisation qu'elle est l'original. Un
 * moteur suit cette déclaration au pied de la lettre — il indexerait le brouillon à la place
 * du site, et les deux se feraient concurrence sur les mêmes mots.
 *
 * Les deux listes sont ici, et non dans les fichiers qui les emploient, parce que trois choses
 * doivent s'accorder : le plan du site, le fichier d'exclusion, et la réalité des dossiers de
 * `app/`. Un test les compare.
 */
export const SITE_URL = "https://clairfinances.com";

/** Les pages ouvertes à un visiteur sans compte — les seules à figurer au plan du site. */
export const PUBLIC_PAGES = [
  "/", "/mentions-legales", "/confidentialite",
  /* Les guides. Ils visent des recherches en français et n'existent qu'en français : voir
     l'en-tête de components/guide.tsx. */
  "/suivi-depenses", "/gestion-budget", "/abonnements", "/banques-compatibles"
] as const;

/** L'appel à l'action, écrit une fois : il apparaît sur chaque guide et sur la page d'accueil. */
export const BRAND_CTA = "Commencer gratuitement";

/**
 * Ce qui demande une session, ou n'a aucune raison d'être exploré.
 *
 * Ces adresses redirigent déjà vers la connexion : les exclure n'ajoute pas de protection, cela
 * évite qu'un robot dépense son budget d'exploration en redirections et fasse entrer dans
 * l'index des pages qui n'ont rien à y faire.
 */
export const PRIVATE_PATHS = [
  "/api/", "/auth/", "/banc/", "/bienvenue",
  "/dashboard", "/transactions", "/assistant", "/budgets", "/compte", "/login"
] as const;

/** Les cartes partagées décrivent la page liée, même hors de l’accueil. */
export function publicMetadata(path: string, title: string, description: string): Metadata {
  return {
    title, description,
    alternates: { canonical: path },
    openGraph: {
      type: "website", siteName: "Clair", locale: "fr_FR", url: path, title, description,
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "Clair — Comprendre ses dépenses" }]
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] }
  };
}
