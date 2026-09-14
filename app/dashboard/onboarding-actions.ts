"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";

/**
 * Note que la présentation d'accueil a été vue.
 *
 * Écrite par l'utilisateur lui-même : c'est lui qui la ferme, et le drapeau ne contient rien de
 * sensible. Un échec ne fait rien échouer — la présentation reviendra, ce qui est moins grave
 * que de la perdre pour quelqu'un qui ne l'avait pas lue.
 */
export async function completeOnboarding() {
  const { user, supabase } = await requireUser();
  const { error } = await supabase
    .from("user_onboarding")
    .upsert({ user_id: user.id }, { onConflict: "user_id" });
  if (error) console.warn("[onboarding] enregistrement impossible", { message: error.message });
  revalidatePath("/dashboard");
}

/** Rejoue la présentation. Accessible depuis la page de compte : la donner une fois puis la
 *  rendre introuvable revient à la réserver à ceux qui n'en avaient pas besoin. */
export async function replayOnboarding() {
  const { user, supabase } = await requireUser();
  await supabase.from("user_onboarding").delete().eq("user_id", user.id);
  revalidatePath("/dashboard");
  revalidatePath("/compte");
}
