import "server-only";

import { OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/auth/oauth";

/**
 * Les fournisseurs de connexion réellement actifs, demandés à Supabase.
 *
 * L'écran de connexion offrait Apple alors que le fournisseur n'était pas configuré : la
 * demande d'autorisation répondait 400, et l'utilisateur lisait « Connexion impossible pour le
 * moment. Réessayez dans un instant. » — un message qui promet que ça marchera plus tard, alors
 * que ça ne marchera jamais. Sur le premier écran du produit, c'est un visiteur perdu par clic.
 *
 * La liste n'est donc plus écrite en dur : elle est lue à la source, celle-là même qui accepte
 * ou refuse la redirection. Activer Apple dans Supabase fera réapparaître le bouton sans qu'on
 * touche au code, et le désactiver le fera disparaître — c'est la seule façon que les deux ne
 * se contredisent pas.
 *
 * En cas d'échec de lecture, on n'affiche aucun bouton plutôt que d'en afficher un qui pourrait
 * être mort : la connexion par mot de passe reste offerte juste en dessous, et un chemin de
 * moins vaut mieux qu'un chemin qui échoue. La réponse est mise en cache une heure, ce réglage
 * ne changeant qu'à la main.
 */
export async function enabledProviders(): Promise<OAuthProvider[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];

  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      next: { revalidate: 3600 }
    });
    if (!response.ok) return [];
    const settings = (await response.json()) as { external?: Record<string, boolean> };
    return OAUTH_PROVIDERS.filter((provider) => settings.external?.[provider] === true);
  } catch {
    return [];
  }
}
