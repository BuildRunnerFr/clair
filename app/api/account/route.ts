import { mutationOriginError, readSmallJson } from "@/lib/security/requests";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteUserAccount } from "@/lib/auth/delete-account";
import { confirmsDeletion } from "@/lib/auth/account-deletion";

/**
 * Suppression du compte, en HTTP.
 *
 * Apple exige qu'une application permettant de créer un compte permette aussi de le supprimer
 * depuis l'application (règle 5.1.1(v)). Une Server Action étant inappelable depuis du natif,
 * cette route est ce qui rendra la suppression possible sur mobile — et sans elle, une
 * soumission à l'App Store serait refusée.
 *
 * DELETE plutôt que POST : c'est exactement ce que le verbe décrit, et un GET préchargé ne peut
 * pas déclencher l'irréversible.
 */
export async function DELETE(request: NextRequest) {
  const originError = mutationOriginError(request);
  if (originError) return originError;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Session expirée." }, { status: 401 });

  // La même confirmation que sur le web : l'adresse recopiée. Un appel d'API n'a pas d'écran,
  // mais il a d'autant plus besoin d'un geste explicite — une requête part sans qu'on la relise.
  const body = await readSmallJson(request);
  if (!confirmsDeletion((body as { confirmation?: unknown } | null)?.confirmation, user.email)) {
    return NextResponse.json({ error: "confirmation_mismatch" }, { status: 400 });
  }

  const outcome = await deleteUserAccount(supabase, user.id);
  if (!outcome.ok) return NextResponse.json({ error: "deletion_failed" }, { status: 500 });

  await supabase.auth.signOut();
  return NextResponse.json({ deleted: true, consentsRevoked: outcome.revoked });
}
