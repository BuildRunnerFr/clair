/**
 * État de santé de l'application, lu depuis le journal d'événements.
 *
 *   npx tsx --env-file=.env.local scripts/health.ts [jours]
 *
 * Répond aux questions qu'on se pose vraiment quand on exploite le service : est-ce que la
 * tâche planifiée tourne encore, combien de synchronisations échouent, et pour combien de
 * comptes distincts. Les journaux de l'hébergeur ne répondent à aucune des trois — ils sont
 * éphémères et ne s'interrogent pas.
 *
 * Le silence est le signal le plus important : une tâche qui a cessé de tourner ne produit
 * aucune erreur. D'où la vérification explicite de la dernière exécution.
 */
import { createClient } from "@supabase/supabase-js";

const days = Number(process.argv[2] ?? 7);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.");

const since = new Date(Date.now() - days * 86_400_000).toISOString();
const db = createClient(url, serviceRoleKey);

const { data: events, error } = await db
  .from("system_events")
  .select("kind,severity,user_id,context,created_at")
  .gte("created_at", since)
  .order("created_at", { ascending: false })
  .limit(2000);
if (error) throw new Error(`Journal illisible : ${error.message}`);

console.log(`\nÉtat de santé — ${days} derniers jours\n${"─".repeat(52)}`);

if (!events?.length) {
  console.log("\nAucun événement.");
  console.log("Si la tâche planifiée devait avoir tourné, c'est le symptôme à examiner :");
  console.log("une tâche arrêtée ne produit pas d'erreur, seulement du silence.\n");
  process.exit(0);
}

const byKind = new Map<string, { count: number; users: Set<string>; last: string; severity: string }>();
for (const event of events) {
  const entry = byKind.get(event.kind) ?? { count: 0, users: new Set<string>(), last: event.created_at, severity: event.severity };
  entry.count++;
  if (event.user_id) entry.users.add(event.user_id);
  byKind.set(event.kind, entry);
}

const mark = { error: "✗", warning: "!", info: "·" } as const;
console.log("\névénement                        occurrences  comptes  dernier");
for (const [kind, entry] of [...byKind].sort((left, right) => right[1].count - left[1].count)) {
  const symbol = mark[entry.severity as keyof typeof mark] ?? "·";
  console.log(`${symbol} ${kind.padEnd(30)} ${String(entry.count).padStart(6)}   ${String(entry.users.size).padStart(6)}   ${entry.last.slice(0, 16).replace("T", " ")}`);
}

// La tâche planifiée est le seul mécanisme dont l'arrêt ne se signale pas de lui-même.
const lastCron = events.find((event) => event.kind === "cron_sync_completed");
console.log(`\n${"─".repeat(52)}`);
if (!lastCron) {
  console.log("⚠  La tâche planifiée n'a pas tourné sur la période.");
  console.log("   Vérifier CRON_SECRET dans Vercel, et l'onglet Cron Jobs du projet.");
} else {
  const hours = Math.round((Date.now() - new Date(lastCron.created_at).getTime()) / 3_600_000);
  const context = lastCron.context as { considered?: number; succeeded?: number; failed?: number };
  console.log(`Dernière synchronisation planifiée : il y a ${hours} h`);
  console.log(`  ${context.succeeded ?? 0} réussie(s) sur ${context.considered ?? 0} examinée(s), ${context.failed ?? 0} en échec`);
  if (hours > 30) console.log("⚠  Plus de 30 h : la tâche quotidienne a manqué un passage.");
}

const needingAction = byKind.get("bank_reauthorization_required");
if (needingAction) {
  console.log(`\n⚠  ${needingAction.users.size} compte(s) dont la banque demande une reconnexion.`);
  console.log("   Ces comptes ne se synchronisent plus, et leurs utilisateurs ne le savent");
  console.log("   que s'ils regardent le tableau de bord.");
  // Le statut et l'appel refusé décident du diagnostic, et sans eux « reconnectez votre banque »
  // recouvre aussi bien un accès retiré par la banque qu'une application mal configurée.
  for (const event of events.filter((item) => item.kind === "bank_reauthorization_required").slice(0, 3)) {
    const context = event.context as { status?: number; operation?: string };
    console.log(`   ${event.created_at.slice(0, 16).replace("T", " ")} · ${context.status ?? "statut inconnu"} sur ${context.operation ?? "appel inconnu"}${explain(context)}`);
  }
}

/** Ce que le refus veut dire, pour n'avoir pas à s'en souvenir six mois plus tard. */
function explain(context: { status?: number; operation?: string }): string {
  if (context.operation === "token_invalid_grant") return " — refresh token mort : reconnexion par l'utilisateur";
  if (context.operation?.startsWith("data_") && context.status === 403) return " — accès retiré côté banque : reconnexion par l'utilisateur";
  if (context.operation?.startsWith("data_") && context.status === 401) return " — jeton refusé : reconnexion par l'utilisateur";
  if (!context.status) return " — antérieur à l'enregistrement du détail";
  return "";
}
console.log();
