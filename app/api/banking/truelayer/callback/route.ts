import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BankConnectionRepository } from "@/lib/db/bank-connection-repository";
import { BankSecretRepository } from "@/lib/db/bank-secret-repository";
import { getTrueLayerConfig } from "@/lib/banking/truelayer/config";
import { TrueLayerBankProvider } from "@/lib/banking/truelayer/truelayer-bank-provider";
import { completeTrueLayerCallback } from "@/lib/banking/truelayer/oauth-service";
import { runBankSync } from "@/lib/banking/run-sync";

/**
 * La reprise d'historique sur deux ans se fait dans cette requête, et elle peut être longue :
 * plusieurs milliers d'opérations à rapatrier, puis à catégoriser. La limite par défaut de
 * l'hébergeur l'interromprait au milieu — et l'interruption tomberait précisément sur le seul
 * moment où la banque accepte de livrer cet historique.
 */
export const maxDuration = 60;

const callbackSchema = z.object({ code: z.string().min(1).max(4096), state: z.string().min(32).max(256) });

export async function GET(request: NextRequest) {
  const destination = new URL("/dashboard", request.url);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (request.nextUrl.searchParams.has("error")) {
    destination.searchParams.set("bank_error", "authorization_denied");
    return NextResponse.redirect(destination);
  }
  const parsed = callbackSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    destination.searchParams.set("bank_error", "invalid_callback");
    return NextResponse.redirect(destination);
  }
  try {
    const config = getTrueLayerConfig();
    const provider = new TrueLayerBankProvider(config);
    const secrets = new BankSecretRepository(createAdminClient());
    const { connection } = await completeTrueLayerCallback({ userId: user.id, code: parsed.data.code, state: parsed.data.state, environment: config.environment }, { states: secrets, tokens: secrets, connections: new BankConnectionRepository(supabase), provider });
    destination.searchParams.set("bank", "connected");
    // La première synchronisation part d'ici, et non d'un geste ultérieur de l'utilisateur.
    //
    // Les deux ans d'historique que la directive autorise ne sont accessibles que pendant la
    // fenêtre qui suit l'authentification — cinq minutes chez certaines banques. Une fenêtre
    // dont l'ouverture dépend du moment où quelqu'un pense à cliquer est une fenêtre manquée :
    // l'attendre revenait à ne jamais récupérer que 90 jours, et à demander deux ans trop tard,
    // c'est-à-dire à recevoir un 403 qui condamnait la connexion qu'on venait d'établir.
    //
    // Un échec ici ne remet pas la connexion en cause : elle est enregistrée et valide, la
    // synchronisation se rejouera. Seule la profondeur d'historique est perdue.
    const outcome = await runBankSync(supabase, user.id, connection.id);
    if (!outcome.ok) console.warn("[bank-callback] première synchronisation manquée", { reason: outcome.reason });
  } catch (error) {
    destination.searchParams.set("bank_error", error instanceof Error && error.message === "oauth_state_invalid" ? "invalid_state" : "connection_failed");
  }
  return NextResponse.redirect(destination);
}
