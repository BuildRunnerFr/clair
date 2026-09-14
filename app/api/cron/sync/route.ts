import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runBankSync } from "@/lib/banking/run-sync";
import { getTrueLayerConfig } from "@/lib/banking/truelayer/config";
import { isCronAuthorized, staleBefore, CRON_MAX_CONNECTIONS } from "@/lib/banking/cron-policy";
import { sendAlert } from "@/lib/alerts/notify";
import { recordEvent } from "@/lib/observability/record";

/**
 * Synchronisation automatique de toutes les connexions bancaires.
 *
 * Sans elle, les données ne se rafraîchissent que si quelqu'un clique. Pour un usage personnel
 * cela passe ; dès qu'il y a des utilisateurs, personne ne clique — ils ouvrent l'application,
 * voient les dépenses d'il y a trois semaines, et concluent qu'elle ne fonctionne pas.
 *
 * Tourne sans session, donc avec la clé de service. C'est acceptable ici parce que chaque
 * opération de runBankSync est explicitement portée par un userId : le cloisonnement entre
 * comptes ne repose pas sur la RLS, mais sur des filtres écrits dans les requêtes.
 */

// Une synchronisation appelle la banque puis catégorise : quelques secondes par connexion.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    // 404 plutôt que 401 : inutile de confirmer à un visiteur non attendu que cette route existe.
    return new NextResponse(null, { status: 404 });
  }

  const startedAt = performance.now();
  const admin = createAdminClient();
  const environment = getTrueLayerConfig().environment;

  // Seules les connexions actives et déjà anciennes : une connexion en attente de
  // réautorisation échouerait à chaque passage, et resynchroniser ce qui vient de l'être
  // dépenserait des appels bancaires pour rien.
  const { data: connections, error } = await admin
    .from("bank_connections")
    .select("id,user_id,last_synced_at")
    .eq("provider", "truelayer")
    .eq("environment", environment)
    .eq("status", "active")
    .or(`last_synced_at.is.null,last_synced_at.lt.${staleBefore(new Date()).toISOString()}`)
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(CRON_MAX_CONNECTIONS);

  if (error) {
    console.error("[cron.sync] lecture des connexions impossible", { message: error.message });
    return NextResponse.json({ error: "connections_unreadable" }, { status: 500 });
  }

  let succeeded = 0;
  const failures: Record<string, number> = {};
  for (const connection of connections ?? []) {
    // Séquentiel à dessein : en parallèle, un utilisateur nombreux en connexions saturerait le
    // quota TrueLayer et ferait échouer les synchronisations des autres.
    const outcome = await runBankSync(admin, connection.user_id, connection.id);
    if (outcome.ok) succeeded++;
    else failures[outcome.reason] = (failures[outcome.reason] ?? 0) + 1;
  }

  const durationMs = Math.round(performance.now() - startedAt);
  console.info("[cron.sync]", { considered: connections?.length ?? 0, succeeded, failures, durationMs });
  // Un passage consigné même quand tout va bien : l'absence d'événement devient alors le signal
  // qu'il faut lire. Une tâche qui ne tourne plus ne produit aucune erreur, seulement du silence.
  await recordEvent({
    kind: "cron_sync_completed",
    severity: Object.keys(failures).length ? "warning" : "info",
    context: { considered: connections?.length ?? 0, succeeded, failed: Object.values(failures).reduce((total, n) => total + n, 0), durationMs }
  });
  /**
   * Une alerte par passage, et seulement quand quelque chose ne va pas.
   *
   * Une par connexion inonderait la boîte le jour où le fournisseur a un incident — et une boîte
   * inondée ne se lit plus, ce qui revient à n'avoir aucune alerte. Le silence, lui, veut dire
   * que le passage s'est bien terminé : c'est le seul cas où l'exploitant n'a rien à faire.
   *
   * La réautorisation est distinguée de la panne parce qu'elle n'appelle pas le même geste :
   * une panne se réessaie toute seule au passage suivant, un consentement retiré attend que
   * l'utilisateur reconnecte sa banque, et il attendra indéfiniment si personne ne le lui dit.
   */
  const areauthoriser = failures.reauthorization_required ?? 0;
  const enPanne = Object.entries(failures).filter(([raison]) => raison !== "reauthorization_required")
    .reduce((total, [, nombre]) => total + nombre, 0);
  if (areauthoriser || enPanne) {
    const lignes = [
      `Synchronisation planifiée du ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`,
      "",
      `Connexions examinées : ${connections?.length ?? 0}`,
      `Réussies : ${succeeded}`,
      ...(enPanne ? [`En échec : ${enPanne} — réessai automatique au prochain passage.`] : []),
      ...(areauthoriser ? [
        `Consentement à renouveler : ${areauthoriser}.`,
        "Ces comptes ne se synchroniseront plus tant que leur propriétaire n'aura pas reconnecté sa banque, et rien ne le lui dit sur son tableau de bord au-delà du bandeau."
      ] : []),
      "",
      "Détail : npm run health"
    ];
    await sendAlert({
      subject: areauthoriser
        ? `Clair — ${areauthoriser} banque(s) à reconnecter`
        : `Clair — ${enPanne} synchronisation(s) en échec`,
      body: lignes.join("\n")
    });
  }

  return NextResponse.json({ considered: connections?.length ?? 0, succeeded, failures, durationMs });
}
