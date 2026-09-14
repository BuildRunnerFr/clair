"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { ProfileRepository } from "@/lib/db/profile-repository";
import { isOldEnough, profileSchema } from "@/lib/profile/profile";
import type { WelcomeState } from "@/app/bienvenue/actions";

/** La même validation que l'accueil : une donnée n'est pas moins vérifiée parce qu'on la corrige. */
export async function updateProfile(_previous: WelcomeState, formData: FormData): Promise<WelcomeState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid" };
  if (parsed.data.birthDate && !isOldEnough(parsed.data.birthDate)) return { error: "tooYoung" };

  const { user, supabase } = await requireUser({ allowIncompleteProfile: true });
  try {
    await new ProfileRepository(supabase).save(user.id, parsed.data);
  } catch {
    return { error: "failed" };
  }
  revalidatePath("/compte");
  redirect("/compte?profile=1");
}
