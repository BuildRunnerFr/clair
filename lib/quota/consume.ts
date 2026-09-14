import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { QUOTAS, toVerdict, type QuotaResource, type QuotaVerdict } from "./policy";

/**
 * Consomme une unité de quota pour l'utilisateur de la session.
 *
 * Passe par une fonction SQL qui décide et incrémente d'un seul geste : deux requêtes
 * simultanées ne peuvent pas lire toutes deux « 39 sur 40 » et passer toutes deux. C'est le
 * défaut d'un compteur lu puis écrit, et il se manifeste précisément quand on cherche à en
 * abuser.
 *
 * Un échec du compteur laisse passer l'appel. C'est délibéré : rendre l'application inutilisable
 * parce qu'une table est illisible coûterait plus cher que la dépense qu'on cherche à éviter, et
 * l'incident se lit dans les journaux.
 */
export async function consumeQuota(
  supabase: SupabaseClient<Database>,
  resource: QuotaResource
): Promise<QuotaVerdict> {
  const { data, error } = await supabase.rpc("consume_quota", { p_resource: resource, p_limit: QUOTAS[resource] });
  if (error) {
    console.warn("[quota] compteur illisible, appel laissé passer", { resource, message: error.message });
    return { allowed: true, used: 0, quota: QUOTAS[resource], remaining: QUOTAS[resource] };
  }
  return toVerdict(data?.[0]);
}
