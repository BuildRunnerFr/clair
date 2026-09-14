import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getSupabaseEnv } from "./env";

export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Configuration serveur Supabase incomplète.");
  const { url } = getSupabaseEnv();
  return createClient<Database>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
