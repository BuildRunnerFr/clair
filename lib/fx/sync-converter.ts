import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminClient } from "@/lib/supabase/admin";
import { FrankfurterFxProvider } from "./fx-provider";
import { convertToBase } from "./fx-converter";
import type { SyncConverter } from "@/lib/banking/sync-transactions";
import { SupabaseFxRepository, UserSettingsRepository } from "@/lib/db/supabase-fx-repository";

/**
 * Assemble le convertisseur utilisé pendant une synchronisation.
 *
 * La devise principale est lue dans les réglages de l'utilisateur ; à défaut, la devise
 * majoritaire de ses transactions sert de repli, ce qui évite qu'un premier import ne
 * produise des montants invisibles faute de réglage.
 */
export async function createSyncConverter(client: SupabaseClient<Database>, userId: string): Promise<SyncConverter> {
  const settings = new UserSettingsRepository(client);
  const configured = await settings.getBaseCurrency(userId);
  const { data } = await client.rpc("finance_base_currency");
  const baseCurrency = configured ?? (data as string | null) ?? "EUR";

  // Lecture sous la session de l'utilisateur, écriture du cache par le client admin : les
  // taux sont une donnée partagée que nul utilisateur ne doit pouvoir empoisonner.
  const store = new SupabaseFxRepository(client, createAdminClient());
  const provider = new FrankfurterFxProvider();
  return (requests) => convertToBase(requests, baseCurrency, provider, store);
}
