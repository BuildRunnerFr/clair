"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseProvider, safeNext } from "@/lib/auth/oauth";
import { checkPassword, PASSWORD_MESSAGES } from "@/lib/auth/password";
import { waitForSessionReady } from "@/lib/auth/session-ready";

export type LoginState = { message?: string; error?: string };

const emailSchema = z.string().email();

/**
 * Où Supabase renvoie l'utilisateur après un lien envoyé par email.
 *
 * Vers des routes qui échangent un code, et non vers /auth/confirm : les modèles d'email par
 * défaut emploient {{ .ConfirmationURL }}, qui vérifie le jeton côté Supabase puis redirige avec
 * un `?code=`. /auth/confirm n'attend qu'un `token_hash`, format des modèles personnalisés — il
 * ne trouvait donc rien et affichait « lien incomplet ou invalide ».
 */
function returnUrl(path: string): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return null;
  try {
    return new URL(path, appUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Connexion par mot de passe.
 *
 * Le message d'échec ne distingue pas « adresse inconnue » de « mot de passe faux ». La
 * distinction n'aide que celui qui cherche à savoir quelles adresses ont un compte ici — et sur
 * un service financier, savoir qu'une adresse en a un est déjà une information.
 */
export async function signInWithPassword(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = emailSchema.safeParse(formData.get("email"));
  const password = typeof formData.get("password") === "string" ? String(formData.get("password")) : "";
  if (!email.success || !password) return { error: "Saisissez votre adresse email et votre mot de passe." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password });
  if (error) {
    console.info("[auth.password] échec de connexion", { code: error.code });
    if (error.code === "email_not_confirmed") {
      return { error: "Votre adresse n’est pas encore confirmée. Ouvrez l’email que nous vous avons envoyé." };
    }
    return { error: "Adresse email ou mot de passe incorrect." };
  }

  // Même précaution qu'après un lien magique : le jeton vient d'être signé, et la première
  // requête échoue tant qu'un validateur légèrement en retard le voit émis dans le futur.
  await waitForSessionReady(() => supabase.from("accounts").select("id").limit(1));
  redirect(safeNext(formData.get("next")));
}

/**
 * Création de compte.
 *
 * Supabase envoie un email de confirmation : c'est ce qui prouve que l'adresse appartient bien
 * à qui s'inscrit, et sans quoi n'importe qui pourrait créer un compte au nom d'un autre puis
 * recevoir ses alertes budgétaires.
 *
 * La réponse est la même que l'adresse soit libre ou déjà prise — le contraire permettrait
 * d'énumérer les comptes existants en essayant des adresses.
 */
export async function signUpWithPassword(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { error: "Saisissez une adresse email valide." };

  const problem = checkPassword(formData.get("password"), email.data);
  if (problem) return { error: PASSWORD_MESSAGES[problem] };

  const redirectTo = returnUrl("/auth/callback");
  if (!redirectTo) return { error: "NEXT_PUBLIC_APP_URL n’est pas configurée." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: email.data,
    password: String(formData.get("password")),
    options: { emailRedirectTo: redirectTo }
  });
  if (error) {
    console.warn("[auth.signup] échec", { code: error.code });
    // Le seul cas qu'on distingue : trop de tentatives. Le taire laisserait croire à une panne.
    if (error.code === "over_email_send_rate_limit") return { error: "Trop de tentatives. Réessayez dans quelques minutes." };
    return { error: "Création impossible pour le moment. Réessayez dans un instant." };
  }
  return { message: "Vérifiez votre boîte email : un lien vous attend pour confirmer votre adresse." };
}

/**
 * Réinitialisation du mot de passe.
 *
 * Confirme toujours l'envoi, y compris pour une adresse inconnue : répondre « ce compte
 * n'existe pas » transformerait ce formulaire en outil de vérification d'adresses.
 */
export async function requestPasswordReset(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { error: "Saisissez une adresse email valide." };

  const redirectTo = returnUrl("/auth/reset");
  if (!redirectTo) return { error: "NEXT_PUBLIC_APP_URL n’est pas configurée." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo });
  if (error) console.warn("[auth.reset] échec", { code: error.code });
  return { message: "Si un compte existe pour cette adresse, un lien de réinitialisation vient d’être envoyé." };
}

/**
 * Connexion par Google ou Apple.
 *
 * Le fournisseur est relu contre une liste blanche : il vient d'un formulaire, donc du client,
 * et Supabase accepterait n'importe quel nom de fournisseur qu'on lui passe.
 */
export async function signInWithProvider(formData: FormData): Promise<LoginState> {
  const provider = parseProvider(formData.get("provider"));
  if (!provider) return { error: "Ce mode de connexion n’est pas disponible." };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return { error: "NEXT_PUBLIC_APP_URL n’est pas configurée." };

  let callbackUrl: string;
  try {
    const url = new URL("/auth/callback", appUrl);
    url.searchParams.set("next", safeNext(formData.get("next")));
    callbackUrl = url.toString();
  } catch {
    return { error: "NEXT_PUBLIC_APP_URL n’est pas une URL valide." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: callbackUrl } });
  if (error || !data.url) {
    console.warn("[auth.oauth] démarrage impossible", { provider, message: error?.message });
    return { error: "Connexion impossible pour le moment. Réessayez dans un instant." };
  }
  // redirect() lève : tout ce qui suit dans l'appelant est ignoré, c'est voulu.
  redirect(data.url);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
