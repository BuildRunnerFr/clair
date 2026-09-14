import type { NextRequest } from "next/server";
import { completeSessionFromCode } from "@/lib/auth/complete-session";

/**
 * Retour d'un lien de réinitialisation de mot de passe.
 *
 * Distincte de /auth/callback par sa seule destination : le lien ouvre une session valide, mais
 * l'utilisateur n'a toujours pas de mot de passe qu'il connaisse. L'envoyer au tableau de bord
 * le laisserait connecté sur cet appareil et enfermé dehors sur tous les autres.
 */
export async function GET(request: NextRequest) {
  return completeSessionFromCode(request, "/compte/mot-de-passe?reset=1");
}
