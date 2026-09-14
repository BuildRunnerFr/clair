"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/user";
import { deleteUserAccount } from "@/lib/auth/delete-account";
import { confirmsDeletion } from "@/lib/auth/account-deletion";

export type DeleteAccountState = { error?: string };

/**
 * Le formulaire de suppression du compte.
 *
 * Ne fait plus que traduire : la suppression elle-même vit dans lib/auth/delete-account, que la
 * route HTTP appelle aussi — Apple exige la suppression depuis l'application, ce qu'une Server
 * Action ne permet pas depuis du natif.
 */
export async function deleteAccount(_state: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  const { user, supabase } = await requireUser({ allowIncompleteProfile: true });
  if (!confirmsDeletion(formData.get("confirmation"), user.email)) {
    return { error: "Saisissez votre adresse email exactement pour confirmer." };
  }

  const outcome = await deleteUserAccount(supabase, user.id);
  if (!outcome.ok) return { error: "La suppression a échoué. Réessayez dans un instant." };

  await supabase.auth.signOut();
  /**
   * Le compte de révocations est repris dans l'adresse de retour.
   *
   * La politique de confidentialité promet que la suppression « révoque l'accès accordé à
   * chacune de vos banques ». Quand une banque refuse, l'utilisateur partait avec la promesse
   * tenue à l'écran et un consentement toujours actif chez elle — et plus aucun moyen d'agir de
   * notre côté, ses jetons venant d'être effacés. Il doit l'apprendre au moment où il peut
   * encore le retirer lui-même.
   */
  redirect(outcome.revoked < outcome.connections ? "/login?deleted=partial" : "/login?deleted=1");
}
