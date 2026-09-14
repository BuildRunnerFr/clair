import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { waitForSessionReady } from "@/lib/auth/session-ready";

/**
 * Ouvre une session à partir du code renvoyé par Supabase, puis mène l'utilisateur quelque part.
 *
 * Partagé par tous les retours d'authentification — fournisseur externe, confirmation
 * d'inscription, réinitialisation de mot de passe — parce que tous reçoivent la même chose : un
 * code à usage unique en paramètre d'URL. Seule la destination change.
 *
 * C'est ce qui manquait et qui a produit « lien incomplet ou invalide » : les modèles d'email
 * par défaut de Supabase emploient {{ .ConfirmationURL }}, qui vérifie le jeton côté Supabase
 * puis redirige avec un `?code=`. La page qui les recevait n'attendait qu'un `token_hash`,
 * format propre aux modèles personnalisés. Elle ne trouvait donc jamais rien.
 */
export async function completeSessionFromCode(request: NextRequest, destination: string): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;

  // Un refus du fournisseur ou un lien expiré arrive par ces paramètres, pas par un code HTTP.
  const denied = searchParams.get("error");
  if (denied) {
    console.info("[auth] lien refusé", { error: denied, description: searchParams.get("error_description") });
    const expired = searchParams.get("error_code") === "otp_expired";
    return NextResponse.redirect(new URL(`/login?error=${expired ? "expired_link" : "provider_denied"}`, request.url));
  }

  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=missing_token", request.url));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.warn("[auth] échange impossible", { code: error.code, status: error.status });
    return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
  }

  // Le jeton vient d'être signé : le laisser devenir acceptable par le validateur avant
  // d'envoyer l'utilisateur sur une page qui interroge la base. Sans cela, la toute première
  // requête échoue et la page s'affiche en erreur — jusqu'à un rechargement, qui a toujours
  // fonctionné.
  const ready = await waitForSessionReady(() => supabase.from("accounts").select("id").limit(1));
  console.info("[auth] session ouverte", { sessionReady: ready, destination });
  return NextResponse.redirect(new URL(destination, request.url));
}
