import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeContext, type EventKind, type EventSeverity } from "./events";

/**
 * Consigne un incident, sans jamais interrompre ce qui l'a produit.
 *
 * Écrit avec la clé de service : un journal que son sujet peut modifier ne vaut rien, et
 * l'écriture est refusée à l'utilisateur par la RLS. Il peut en revanche lire ce qui le
 * concerne — c'est ainsi qu'il apprend que sa banque demande une reconnexion.
 *
 * N'échoue jamais vers l'appelant. Faire échouer une synchronisation par ailleurs réussie
 * parce que son journal n'a pas pu s'écrire serait inverser les priorités : le journal sert
 * l'opération, il ne la commande pas.
 */
export async function recordEvent(input: {
  kind: EventKind;
  severity?: EventSeverity;
  userId?: string | null;
  context?: Record<string, unknown>;
  client?: SupabaseClient<Database>;
}): Promise<void> {
  try {
    const client = input.client ?? createAdminClient();
    await client.from("system_events").insert({
      user_id: input.userId ?? null,
      kind: input.kind,
      severity: input.severity ?? "warning",
      context: safeContext(input.context ?? {})
    });
  } catch (error) {
    console.warn("[events] écriture impossible", { kind: input.kind, message: error instanceof Error ? error.message : "inconnue" });
  }
}
