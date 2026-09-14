"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { destinationFor, parseConfirmationInput } from "@/lib/auth/confirm";
import { waitForSessionReady } from "@/lib/auth/session-ready";

export async function confirmMagicLink(formData: FormData) {
  const parsed = parseConfirmationInput({
    tokenHash: typeof formData.get("token_hash") === "string" ? String(formData.get("token_hash")) : null,
    type: typeof formData.get("type") === "string" ? String(formData.get("type")) : null
  });

  console.info("[auth.confirm] request", {
    token_hash_present: Boolean(formData.get("token_hash")),
    token_hash_length: typeof formData.get("token_hash") === "string" ? String(formData.get("token_hash")).length : 0,
    type: typeof formData.get("type") === "string" ? formData.get("type") : null
  });

  if (!parsed.ok) redirect(`/login?error=${parsed.reason}`);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: parsed.tokenHash, type: parsed.type });
  if (error) {
    console.warn("[auth.confirm] verifyOtp failed", { code: error.code, status: error.status, message: error.message });
    redirect(`/login?error=${error.code === "otp_expired" ? "expired_link" : "invalid_link"}`);
  }
  // Le jeton vient d'être signé : le laisser devenir acceptable par le validateur avant
  // d'envoyer l'utilisateur sur une page qui interroge immédiatement la base. Sans cela, la
  // toute première requête échoue et le tableau de bord s'affiche en erreur — jusqu'à un
  // rechargement, qui a toujours fonctionné.
  const ready = await waitForSessionReady(() => supabase.from("accounts").select("id").limit(1));
  console.info("[auth.confirm] verifyOtp succeeded", { sessionReady: ready });
  redirect(destinationFor(parsed.type));
}
