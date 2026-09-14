import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { CountryCode, Gender, Profile, ProfileInput } from "@/lib/profile/profile";

export class ProfileRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  /**
   * Renvoie null quand le profil n'existe pas encore, et non un profil vide : les deux
   * situations mènent au même écran d'accueil, mais seule la première justifie de l'imposer.
   */
  async get(userId: string): Promise<Profile | null> {
    const { data, error } = await this.client.from("user_profiles").select("first_name,last_name,birth_date,gender,country").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(`Échec de lecture du profil: ${error.message}`);
    if (!data) return null;
    return {
      firstName: data.first_name,
      lastName: data.last_name,
      birthDate: data.birth_date,
      gender: (data.gender as Gender | null) ?? null,
      country: (data.country as CountryCode | null) ?? null
    };
  }

  async save(userId: string, input: ProfileInput): Promise<void> {
    // Les champs facultatifs vides deviennent null plutôt que chaîne vide : une contrainte de
    // longueur minimale les refuserait, et « présent mais vide » n'est pas un état qu'on veut
    // avoir à distinguer de « absent » à la lecture.
    const { error } = await this.client.from("user_profiles").upsert({
      user_id: userId,
      first_name: input.firstName.trim(),
      last_name: input.lastName?.trim() || null,
      birth_date: input.birthDate || null,
      gender: input.gender || null,
      country: input.country
    }, { onConflict: "user_id" });
    if (error) throw new Error(`Échec d’enregistrement du profil: ${error.message}`);
  }
}
