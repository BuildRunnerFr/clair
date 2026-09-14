"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { runBankSync } from "@/lib/banking/run-sync";

/**
 * Le bouton « Synchroniser » du tableau de bord.
 *
 * Ne fait plus que traduire : la synchronisation elle-même vit dans lib/banking/run-sync, que
 * la route HTTP appelle aussi. Ici on passe d'un résultat à une URL, rien de plus.
 */
export async function syncTrueLayer(formData: FormData) {
  const connectionId = z.string().uuid().safeParse(formData.get("connection_id"));
  if (!connectionId.success) redirect("/dashboard?bank_error=invalid_connection");
  const { user, supabase } = await requireUser();
  const outcome = await runBankSync(supabase, user.id, connectionId.data);
  redirect(outcome.ok
    ? `/dashboard?bank=sync_ok&accounts=${outcome.accounts}&added=${outcome.added}&updated=${outcome.updated}&ignored=${outcome.ignored}&errors=0&duration_ms=${outcome.durationMs}`
    : `/dashboard?bank_error=${outcome.reason}`);
}
