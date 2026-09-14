"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/user";
import { ProfileRepository } from "@/lib/db/profile-repository";
import { isOldEnough, profileSchema } from "@/lib/profile/profile";

export interface WelcomeState { error?: string }

export async function saveProfile(_previous: WelcomeState, formData: FormData): Promise<WelcomeState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid" };
  // La majorité est vérifiée et non seulement demandée : une date de naissance qu'on collecte
  // sans jamais la regarder ne sert à rien, et ne justifie donc pas d'être collectée.
  if (parsed.data.birthDate && !isOldEnough(parsed.data.birthDate)) return { error: "tooYoung" };

  const { user, supabase } = await requireUser({ allowIncompleteProfile: true });
  try {
    await new ProfileRepository(supabase).save(user.id, parsed.data);
  } catch {
    return { error: "failed" };
  }
  redirect("/dashboard");
}
