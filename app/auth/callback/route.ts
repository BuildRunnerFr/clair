import type { NextRequest } from "next/server";
import { completeSessionFromCode } from "@/lib/auth/complete-session";
import { safeNext } from "@/lib/auth/oauth";

/**
 * Retour d'un fournisseur d'identification, et confirmation d'adresse à l'inscription.
 *
 * Une route et non une page, contrairement à l'ancien lien magique : celui-ci demandait une
 * confirmation explicite parce qu'un lien reçu par email peut avoir été transféré ou pré-visité.
 * Ici l'utilisateur vient de valider chez le fournisseur, ou de cliquer dans un email qu'il
 * attendait — l'intention est établie, et un écran de plus ne protégerait de rien.
 */
export async function GET(request: NextRequest) {
  return completeSessionFromCode(request, safeNext(request.nextUrl.searchParams.get("next")));
}
