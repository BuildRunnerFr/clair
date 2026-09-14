import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminClient } from "@/lib/supabase/admin";
import { BankConnectionRepository } from "@/lib/db/bank-connection-repository";
import { BankSecretRepository } from "@/lib/db/bank-secret-repository";
import { TrueLayerBankProvider } from "@/lib/banking/truelayer/truelayer-bank-provider";
import { getTrueLayerConfig } from "@/lib/banking/truelayer/config";

export type DeletionOutcome = { ok: true; revoked: number; connections: number } | { ok: false; reason: "failed" };

/**
 * Efface un compte et tout ce qui s'y rattache, sans rien décider de l'affichage.
 *
 * Extraite de la Server Action qui la portait, pour être appelable en HTTP. Ce n'est pas une
 * anticipation gratuite : Apple exige qu'une application permettant de créer un compte permette
 * aussi de le supprimer depuis l'application (règle 5.1.1(v) de l'App Store). Une Server Action
 * étant inappelable depuis du natif, la suppression serait restée le seul geste impossible sur
 * mobile — et le seul qui fasse refuser une soumission.
 *
 * L'ordre compte. On révoque d'abord le consentement auprès de chaque banque, tant que les
 * jetons sont encore lisibles ; ensuite seulement on supprime l'utilisateur, ce qui emporte en
 * cascade comptes, transactions, budgets, abonnements, conversations et jetons chiffrés. Faire
 * l'inverse laisserait l'accès ouvert côté banque sans plus aucun moyen de le fermer.
 *
 * La suppression passe par la clé de service : un utilisateur n'a pas le droit d'effacer une
 * ligne de auth.users avec sa propre session, et c'est heureux.
 */
export async function deleteUserAccount(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<DeletionOutcome> {
  const connections = await new BankConnectionRepository(supabase).list(userId);
  let revoked = 0;

  if (connections.length) {
    const admin = createAdminClient();
    const secrets = new BankSecretRepository(admin);
    const config = getTrueLayerConfig();
    for (const connection of connections) {
      // Au mieux : une banque injoignable ne doit pas retenir l'utilisateur. Le consentement
      // finira par expirer de lui-même, et ses jetons vont disparaître dans un instant.
      try {
        const tokens = await secrets.getTokens(connection.id);
        if (!tokens) { console.warn("[account.delete] aucun jeton à révoquer", { connectionId: connection.id }); continue; }
        // Un refus n'est pas une exception : revokeConsent rend false, et cette branche ne
        // journalisait rien du tout. On lisait « connections: 1, revoked: 0 » sans jamais savoir
        // pourquoi — alors que la politique de confidentialité promet cette révocation.
        if (await new TrueLayerBankProvider(config, tokens.accessToken).revokeConsent()) revoked++;
        else console.warn("[account.delete] révocation refusée par la banque", { connectionId: connection.id, environment: config.environment });
      } catch (error) {
        console.warn("[account.delete] révocation impossible", { connectionId: connection.id, message: error instanceof Error ? error.message : "inconnue" });
      }
    }
  }

  const { error } = await createAdminClient().auth.admin.deleteUser(userId);
  if (error) {
    console.error("[account.delete] suppression refusée", { message: error.message });
    return { ok: false, reason: "failed" };
  }

  console.info("[account.delete] compte supprimé", { connections: connections.length, revoked });
  return { ok: true, revoked, connections: connections.length };
}
