"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/user";
import { checkPassword, PASSWORD_MESSAGES } from "@/lib/auth/password";

export type PasswordState = { error?: string };

/**
 * Définit ou remplace le mot de passe du compte connecté.
 *
 * Aucune vérification de l'ancien mot de passe : cette page sert aussi bien à celui qui vient
 * de suivre un lien de réinitialisation — qui n'en a donc plus — qu'à celui qui s'est connecté
 * par Google et n'en a jamais eu. Dans les deux cas, la preuve est déjà faite : la session
 * n'existe que parce qu'un email a été reçu ou qu'un fournisseur a authentifié la personne.
 */
export async function updatePassword(_state: PasswordState, formData: FormData): Promise<PasswordState> {
  const { user, supabase } = await requireUser({ allowIncompleteProfile: true });

  const password = formData.get("password");
  const confirmation = formData.get("confirmation");
  if (typeof password !== "string" || password !== confirmation) {
    return { error: "Les deux mots de passe ne correspondent pas." };
  }

  const problem = checkPassword(password, user.email);
  if (problem) return { error: PASSWORD_MESSAGES[problem] };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.warn("[auth.password] mise à jour refusée", { code: error.code });
    if (error.code === "same_password") return { error: "Ce mot de passe est identique à l’ancien." };
    return { error: "Mise à jour impossible. Réessayez dans un instant." };
  }

  console.info("[auth.password] mot de passe défini");
  redirect("/compte?password=1");
}
