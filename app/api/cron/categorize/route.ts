import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SupabaseTransactionRepository } from "@/lib/db/supabase-transaction-repository";
import { createOpenAIProviderIfConfigured } from "@/lib/ai/openai-provider";
import { recategorizeHistoricalTransactions } from "@/lib/ai/recategorize";
import { isCronAuthorized } from "@/lib/banking/cron-policy";

/**
 * Vide la file des transactions non catégorisées, autant que le temps imparti le permet.
 *
 * La catégorisation qui suit une synchronisation traite le delta du jour : une poignée de
 * marchands, quelques secondes. Une reprise d'historique en découvre des centaines d'un coup —
 * constaté à 369 marchands distincts après un rattrapage de deux ans — et cette poignée ne
 * suffit plus. L'utilisateur voit alors « 679 non catégorisé » sans rien pouvoir y faire, et
 * conclut, à raison, que l'application ne fait pas son travail.
 *
 * D'où une tâche dédiée, qui boucle jusqu'à épuisement de la file ou de son budget de temps.
 * Elle s'arrête aussi dès qu'un tour ne trouve plus rien à tenter : continuer reviendrait à
 * redemander à l'IA ce qu'elle vient de ne pas savoir répondre.
 */
export const maxDuration = 60;

/** Marge sous la limite de l'hébergeur : une passe interrompue perd son travail. */
const TIME_BUDGET_MS = 45_000;

/** Assez pour avancer vite, assez peu pour qu'une passe se termine avant l'échéance. */
const MERCHANTS_PER_PASS = 40;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new NextResponse(null, { status: 404 });
  }

  const startedAt = Date.now();
  const admin = createAdminClient();
  const aiProvider = createOpenAIProviderIfConfigured();
  if (!aiProvider) return NextResponse.json({ skipped: "ai_not_configured" });

  // Les utilisateurs ayant une connexion bancaire : ce sont les seuls à pouvoir accumuler des
  // transactions, et la liste est bornée sans avoir à parcourir la table des transactions.
  const { data: owners, error } = await admin.from("bank_connections").select("user_id").eq("status", "active");
  if (error) return NextResponse.json({ error: "owners_unreadable" }, { status: 500 });
  const userIds = [...new Set((owners ?? []).map((row) => row.user_id))];

  const repository = new SupabaseTransactionRepository(admin);
  const report: Record<string, { passes: number; categorized: number; remaining: number }> = {};

  for (const [position, userId] of userIds.entries()) {
    let passes = 0;
    let categorized = 0;
    let remaining = 0;
    // Le temps restant est réparti entre les utilisateurs : sans cela, le premier de la liste
    // consommerait tout le budget et les autres n'avanceraient jamais.
    const share = startedAt + TIME_BUDGET_MS * ((position + 1) / userIds.length);
    while (Date.now() < share) {
      const outcome = await recategorizeHistoricalTransactions(userId, repository, aiProvider, 1000, undefined, MERCHANTS_PER_PASS);
      passes++;
      categorized += outcome.categorizedByRule + outcome.categorizedByAI;
      remaining = outcome.remaining;
      if (!outcome.merchantsAttempted) break;
    }
    if (passes) report[userId.slice(0, 8)] = { passes, categorized, remaining };
  }

  const durationMs = Date.now() - startedAt;
  console.info("[cron.categorize]", { users: userIds.length, report, durationMs });
  return NextResponse.json({ users: userIds.length, report, durationMs });
}
