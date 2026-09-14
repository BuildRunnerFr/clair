import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import type { Database } from "@/types/supabase";

/**
 * Le client Supabase de l'application mobile.
 *
 * Les mêmes fonctions Postgres que le web, appelées directement : c'est ce qui rend ce portage
 * abordable. Les vingt RPC sont en `security invoker` et filtrent sur auth.uid(), si bien qu'un
 * téléphone authentifié y accède exactement comme un navigateur — sans backend intermédiaire à
 * réécrire.
 *
 * La session va dans le trousseau du système et non dans le stockage ordinaire : un jeton
 * d'accès à des données bancaires n'a rien à faire dans un fichier que n'importe quelle
 * sauvegarde recopie en clair.
 */
const store = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key)
};

const extra = Constants.expoConfig?.extra as { supabaseUrl?: string; supabaseKey?: string } | undefined;
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra?.supabaseUrl;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? extra?.supabaseKey;

if (!url || !key) {
  throw new Error("EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY sont requis.");
}

export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: store,
    autoRefreshToken: true,
    persistSession: true,
    // Une application native ne reçoit pas de session dans l'URL : le retour d'authentification
    // passe par un lien profond que l'on traite explicitement.
    detectSessionInUrl: false
  }
});
