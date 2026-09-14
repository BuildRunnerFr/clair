import { mutationOriginError, readSmallJson } from "@/lib/security/requests";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { runBankSync, type SyncFailure } from "@/lib/banking/run-sync";
import { consumeQuota } from "@/lib/quota/consume";
import { quotaMessage } from "@/lib/quota/policy";

/**
 * Synchronisation d'une connexion bancaire, en HTTP.
 *
 * Existe parce qu'une Server Action ne s'appelle que depuis React : ni une application mobile,
 * ni une tâche planifiée, ni un script ne peuvent déclencher la synchronisation par le bouton
 * du tableau de bord. Cette route est la même opération, joignable par n'importe quel client
 * porteur d'une session.
 *
 * POST et non GET : l'opération écrit, coûte des appels à la banque, et ne doit pas partir
 * parce qu'un navigateur a préchargé un lien.
 */

const bodySchema = z.object({ connectionId: z.string().uuid() });

/** Ce que chaque échec vaut en HTTP : le client doit pouvoir décider sans lire le texte. */
const STATUS: Record<SyncFailure, number> = {
  invalid_connection: 404,
  // 409 : rien n'est cassé, une synchronisation est déjà en cours. Réessayer plus tard suffit.
  sync_busy: 409,
  // 403 : la requête est valide, mais la banque exige une action de l'utilisateur.
  reauthorization_required: 403,
  sync_failed: 502
};

export async function POST(request: NextRequest) {
  const originError = mutationOriginError(request);
  if (originError) return originError;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Session expirée." }, { status: 401 });

  const parsed = bodySchema.safeParse(await readSmallJson(request));
  if (!parsed.success) return NextResponse.json({ error: "connectionId manquant ou invalide." }, { status: 400 });

  const quota = await consumeQuota(supabase, "bank_sync");
  if (!quota.allowed) return NextResponse.json({ error: "quota_exceeded", message: quotaMessage("bank_sync", quota) }, { status: 429 });

  const outcome = await runBankSync(supabase, user.id, parsed.data.connectionId);
  if (outcome.ok) return NextResponse.json(outcome);
  return NextResponse.json({ error: outcome.reason, message: outcome.message }, { status: STATUS[outcome.reason] });
}
