/** Les seuls fournisseurs acceptés. Tout le reste est refusé, y compris ce que le formulaire prétend. */
export const OAUTH_PROVIDERS = ["google", "apple"] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function parseProvider(value: unknown): OAuthProvider | null {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (OAUTH_PROVIDERS as readonly string[]).includes(candidate) ? (candidate as OAuthProvider) : null;
}

/**
 * Filtre la destination demandée après connexion.
 *
 * Ce paramètre traverse une redirection contrôlée par l'utilisateur : c'est la forme classique
 * de la redirection ouverte. Un attaquant qui obtient `?next=https://sa-copie-du-site` renvoie
 * la victime, fraîchement authentifiée et en confiance, vers une page qu'il contrôle.
 *
 * D'où une liste blanche de formes plutôt qu'une liste noire de motifs. On n'accepte qu'un
 * chemin absolu de ce site : commençant par une seule barre oblique, sans barre ni anti-slash en
 * second caractère — `//evil.com` et `/\evil.com` sont lus comme des URL absolues par les
 * navigateurs — et sans schéma.
 */
export function safeNext(value: unknown, fallback = "/dashboard"): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return fallback;
  // Un chemin encodé peut encore cacher un schéma une fois décodé par le navigateur.
  if (/^\/[^?#]*:/.test(candidate)) return fallback;
  // Espaces et caractères de contrôle : un navigateur les retire avant d'interpréter l'URL,
  // si bien qu'un « /<tab>javascript:… » redevient un schéma une fois nettoyé.
  if (/[\s\u0000-\u001f\u007f]/.test(candidate)) return fallback;
  return candidate;
}

/** Libellés affichés. Séparés du code du fournisseur, qui lui ne change jamais. */
export const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: "Google",
  apple: "Apple"
};
