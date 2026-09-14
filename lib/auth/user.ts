import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileRepository } from "@/lib/db/profile-repository";
import { isProfileComplete, type Profile } from "@/lib/profile/profile";

/**
 * L'utilisateur de la session, et son profil.
 *
 * Le profil est chargé ici plutôt que par chaque page : c'est une lecture par clé primaire, et
 * la moitié de l'application en a besoin — le prénom pour saluer, le pays pour choisir les
 * banques. Le faire une fois évite autant de requêtes que d'appelants.
 *
 * Un profil incomplet renvoie vers l'accueil. Les pages qui doivent rester joignables dans cet
 * état — l'accueil lui-même, et le compte, d'où l'on peut toujours partir — passent
 * `allowIncompleteProfile`. Sans cette échappatoire, un champ mal validé enfermerait
 * l'utilisateur dans un formulaire sans porte de sortie.
 */
export async function requireUser(options: { allowIncompleteProfile?: boolean } = {}) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  let profile: Profile | null = null;
  try {
    profile = await new ProfileRepository(supabase).get(user.id);
  } catch {
    // Un profil illisible ne doit pas fermer l'application : on continue sans, et la page
    // s'affiche avec ses valeurs par défaut plutôt que de renvoyer une erreur.
    profile = null;
  }
  if (!options.allowIncompleteProfile && !isProfileComplete(profile)) redirect("/bienvenue");

  return { user, supabase, profile };
}
