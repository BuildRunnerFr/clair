/**
 * Les pictogrammes de la page d'accueil.
 *
 * Dessinés à la main plutôt que chargés : une page d'accueil ne doit dépendre d'aucun tiers pour
 * s'afficher, et la politique de sécurité de contenu interdit de toute façon les images
 * distantes. Un seul trait, la couleur du texte, vingt pixels : ils ponctuent, ils n'illustrent
 * pas.
 */
const BASE = { width: 20, height: 20, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const ICONS = {
  bolt: <svg {...BASE} aria-hidden="true"><path d="M11 2 4 11h5l-1 7 7-9h-5l1-7Z" /></svg>,
  eye: <svg {...BASE} aria-hidden="true"><path d="M1.7 10S4.6 4.8 10 4.8 18.3 10 18.3 10 15.4 15.2 10 15.2 1.7 10 1.7 10Z" /><circle cx="10" cy="10" r="2.4" /></svg>,
  lock: <svg {...BASE} aria-hidden="true"><rect x="4" y="8.6" width="12" height="8" rx="1.4" /><path d="M7 8.6V6.4a3 3 0 0 1 6 0v2.2" /></svg>,
  shield: <svg {...BASE} aria-hidden="true"><path d="M10 2.2 16 4.6v5c0 3.6-2.4 6.7-6 8.2-3.6-1.5-6-4.6-6-8.2v-5L10 2.2Z" /><path d="m7.4 9.8 1.9 1.9 3.4-3.6" /></svg>,
  chart: <svg {...BASE} aria-hidden="true"><path d="M3 16.5h14" /><path d="M5.5 13.4V9.2M9.2 13.4V5.6M12.9 13.4v-5M16.6 13.4V7" /></svg>,
  repeat: <svg {...BASE} aria-hidden="true"><path d="M3.4 8.2A6.7 6.7 0 0 1 15.4 6M16.6 11.8A6.7 6.7 0 0 1 4.6 14" /><path d="M15.6 2.6v3.6H12M4.4 17.4v-3.6H8" /></svg>,
  target: <svg {...BASE} aria-hidden="true"><circle cx="10" cy="10" r="7.2" /><circle cx="10" cy="10" r="3.4" /><circle cx="10" cy="10" r=".6" fill="currentColor" /></svg>,
  calendar: <svg {...BASE} aria-hidden="true"><rect x="3" y="4.6" width="14" height="12.4" rx="1.4" /><path d="M3 8.4h14M6.8 2.8v3.2M13.2 2.8v3.2" /></svg>,
  chat: <svg {...BASE} aria-hidden="true"><path d="M17 12.2a2 2 0 0 1-2 2H7l-4 3V5.8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6.4Z" /></svg>,
  layers: <svg {...BASE} aria-hidden="true"><path d="m10 2.6 7.2 3.7L10 10 2.8 6.3 10 2.6Z" /><path d="m2.8 10 7.2 3.7L17.2 10M2.8 13.7l7.2 3.7 7.2-3.7" /></svg>,
  bank: <svg {...BASE} aria-hidden="true"><path d="M2.8 7.6 10 3.4l7.2 4.2M4.6 8.6v6.8M8.2 8.6v6.8M11.8 8.6v6.8M15.4 8.6v6.8M3 17h14" /></svg>,
  noAds: <svg {...BASE} aria-hidden="true"><circle cx="10" cy="10" r="7.2" /><path d="m5.4 5.4 9.2 9.2" /></svg>
} as const;

export type IconName = keyof typeof ICONS;
