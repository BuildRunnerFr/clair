import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminClient } from "@/lib/supabase/admin";
import { BankConnectionRepository } from "@/lib/db/bank-connection-repository";
import { BankSecretRepository } from "@/lib/db/bank-secret-repository";
import { SupabaseTransactionRepository } from "@/lib/db/supabase-transaction-repository";
import { SubscriptionRepository } from "@/lib/db/subscription-repository";
import { TrueLayerBankProvider } from "@/lib/banking/truelayer/truelayer-bank-provider";
import { getTrueLayerConfig } from "@/lib/banking/truelayer/config";
import { syncTransactions } from "@/lib/banking/sync-transactions";
import { BankAuthorizationError, isBankAuthorizationError } from "@/lib/banking/bank-provider";
import { createOpenAIProviderIfConfigured } from "@/lib/ai/openai-provider";
import { createSyncConverter } from "@/lib/fx/sync-converter";
import { detectRecurringIncome, detectSubscriptions } from "@/lib/subscriptions/detect";
import { safeWindowStart, syncWindow } from "@/lib/banking/history-window";
import { recategorizeHistoricalTransactions } from "@/lib/ai/recategorize";
import { recordEvent } from "@/lib/observability/record";

export type SyncFailure = "invalid_connection" | "sync_busy" | "reauthorization_required" | "sync_failed";

export type SyncOutcome =
  | { ok: true; accounts: number; added: number; updated: number; ignored: number; durationMs: number }
  | { ok: false; reason: SyncFailure; message?: string };

/**
 * Synchronise une connexion bancaire, sans rien décider de l'affichage.
 *
 * Extrait de la Server Action qui la portait pour être appelable autrement. Une Server Action
 * est un protocole propre à React : ni une application mobile, ni une tâche planifiée, ni un
 * script ne peuvent l'invoquer. La même logique sert désormais à la fois au bouton du tableau
 * de bord et à la route HTTP, sans être écrite deux fois — c'est cette duplication, et non le
 * transport, qui aurait fini par produire deux comportements divergents.
 *
 * D'où un résultat structuré plutôt qu'une redirection : l'appelant traduit en URL, en JSON ou
 * en journal selon ce qu'il est.
 */
export async function runBankSync(
  supabase: SupabaseClient<Database>,
  userId: string,
  connectionId: string
): Promise<SyncOutcome> {
  const connections = new BankConnectionRepository(supabase);
  const connection = await connections.findOwned(userId, connectionId);
  const config = getTrueLayerConfig();
  // Comparée à l'environnement configuré, et non à "sandbox" en dur : une connexion créée en
  // live était jusqu'ici systématiquement rejetée.
  if (!connection || connection.provider !== "truelayer" || connection.environment !== config.environment) {
    return { ok: false, reason: "invalid_connection" };
  }

  const lockId = randomUUID();
  if (!await connections.trySyncLock(connection.id, lockId)) return { ok: false, reason: "sync_busy" };

  const startedAt = performance.now();
  let outcome: SyncOutcome = { ok: false, reason: "sync_failed" };
  let accountCount = connection.accountCount;
  let failureMessage: string | undefined;

  try {
    const secrets = new BankSecretRepository(createAdminClient());
    let tokens = await secrets.getTokens(connection.id);
    if (!tokens) throw new BankAuthorizationError("Aucun identifiant bancaire enregistré. Reconnectez votre banque.");
    let provider = new TrueLayerBankProvider(config, tokens.accessToken);
    if (tokens.expiresAt.getTime() <= Date.now() + 60_000) {
      if (!tokens.refreshToken) throw new BankAuthorizationError("Le consentement bancaire a expiré. Reconnectez votre banque.");
      const refreshed = await provider.refreshAccessToken(tokens.refreshToken);
      tokens = { ...refreshed, refreshToken: refreshed.refreshToken ?? tokens.refreshToken };
      await secrets.saveTokens(connection.id, tokens);
      provider = new TrueLayerBankProvider(config, tokens.accessToken);
    }

    const accounts = await provider.getAccounts(connection.providerConnectionId);
    accountCount = accounts.length;
    // Renseigne le nom des connexions établies avant qu'il ne soit capté : la première
    // synchronisation venue le comble, sans demander de reconnexion.
    if (!connection.displayName) {
      const institutionName = await provider.getInstitutionName();
      if (institutionName) await connections.setDisplayName(userId, connection.id, institutionName);
    }

    const to = new Date();
    const repository = new SupabaseTransactionRepository(supabase);
    // La profondeur dépend du moment, non de ce qui manque : hors de la fenêtre qui suit
    // l'authentification, demander plus de 90 jours ne renvoie pas moins de données, cela
    // renvoie access_denied — et le 403 qui s'ensuit condamne une connexion valide.
    const { from, backfill } = syncWindow({
      lastSyncedAt: connection.lastSyncedAt ? new Date(connection.lastSyncedAt) : null,
      authorizedAt: connection.authorizedAt ? new Date(connection.authorizedAt) : null,
      now: to
    });
    if (backfill) console.info("[bank-sync] reprise d'historique dans la fenêtre SCA", { depuis: from.toISOString().slice(0, 10) });
    const converter = await createSyncConverter(supabase, userId);
    const importFrom = async (start: Date) => syncTransactions(userId, connection.providerConnectionId, provider, repository, { from: start, to }, createOpenAIProviderIfConfigured(), converter);
    // Le repli, et pourquoi il existe malgré la vérification de la fenêtre.
    //
    // La durée de la fenêtre SCA appartient à la banque : cinq minutes chez l'une, quarante-cinq
    // chez l'autre, et rien n'oblige un établissement à s'en tenir à ce qui est annoncé. Une
    // reprise refusée doit donc coûter la profondeur d'historique, jamais la connexion — un 403
    // reçu ici serait autrement lu comme un consentement révoqué, et marquerait à réautoriser
    // une connexion autorisée depuis quelques secondes.
    let summary;
    try {
      summary = await importFrom(from);
    } catch (error) {
      if (!backfill || !isBankAuthorizationError(error)) throw error;
      console.warn("[bank-sync] reprise refusée, repli sur la fenêtre courte", { depuis: from.toISOString().slice(0, 10) });
      summary = await importFrom(safeWindowStart(to));
    }
    if (summary.errors.length) throw new Error("Certaines transactions n’ont pas pu être synchronisées");

    // Rattrapage : la catégorisation faite pendant l'import laisse parfois des transactions de
    // côté — un appel à l'IA qui échoue, un marchand inconnu. Une seconde passe les reprend
    // immédiatement, plutôt que de les laisser s'accumuler en attendant un geste de
    // l'utilisateur. Catégoriser ses propres dépenses n'est pas son travail : c'est celui de
    // l'application, et le lui déléguer serait avouer qu'elle ne sait pas le faire.
    if (summary.uncategorized > 0) {
      try {
        const rescue = await recategorizeHistoricalTransactions(userId, new SupabaseTransactionRepository(supabase), createOpenAIProviderIfConfigured());
        console.info("[bank-sync] rattrapage de catégorisation", { restantes: summary.uncategorized, parRegle: rescue.categorizedByRule, parIA: rescue.categorizedByAI, appels: rescue.aiCalls, erreurs: rescue.aiErrors });
      } catch (error) {
        // Un rattrapage manqué laisse des transactions en « Non catégorisé », ce qui est lisible
        // et sans gravité. Il ne doit pas faire échouer une synchronisation par ailleurs réussie.
        console.warn("[bank-sync] rattrapage impossible", { message: error instanceof Error ? error.message : "inconnu" });
      }
    }

    // Rejouée après chaque import : c'est le seul moment où de nouvelles occurrences peuvent
    // faire apparaître — ou faire disparaître — une récurrence. Un échec ici ne doit pas
    // annuler une synchronisation réussie.
    try {
      const all = await repository.getTransactions(userId);
      const flows = all.filter(item => !item.pending).map((item) => ({
        merchantName: item.merchantName,
        amount: item.amountBase != null ? item.amountBase : item.amount,
        currency: item.amountBase != null && item.baseCurrency ? item.baseCurrency : item.currency,
        transactionDate: item.transactionDate
      }));
      // Les encaissements réguliers sont détectés en même temps : le salaire donne à la
      // prévision de solde sa remontée mensuelle, sans laquelle elle ne décrirait qu'une chute.
      await new SubscriptionRepository(supabase).replaceAll(userId, detectSubscriptions(flows), detectRecurringIncome(flows));
    } catch (error) {
      console.warn("[subscriptions] détection ignorée", { message: error instanceof Error ? error.message : "inconnu" });
    }

    const durationMs = Math.round(performance.now() - startedAt);
    console.info("[bank-sync]", { provider: "truelayer", environment: config.environment, durationMs, accountCount, received: summary.received, added: summary.added, updated: summary.updated, ignored: summary.ignored, errors: summary.errors.length, fetchDurationMs: summary.fetchDurationMs, writeDurationMs: summary.writeDurationMs, databaseBatches: summary.databaseBatches, databaseUpsertCalls: summary.databaseUpsertCalls, categorization: { durationMs: summary.categorizationDurationMs, unknownMerchantsCalled: summary.aiCalls, categorizedByRule: summary.categorizedByRule, categorizedByAI: summary.categorizedByAI, remaining: summary.uncategorized, errors: summary.aiErrors, errorCodes: summary.aiErrorCodes }, providerMetrics: provider.getMetrics() });
    outcome = { ok: true, accounts: accounts.length, added: summary.added, updated: summary.updated, ignored: summary.ignored, durationMs };
  } catch (error) {
    // Un consentement expiré n'est pas une panne à réessayer : il ne se quitte que par une
    // réautorisation de l'utilisateur, et la connexion doit le refléter.
    const reauthorization = isBankAuthorizationError(error);
    failureMessage = reauthorization ? (error as BankAuthorizationError).message : "La synchronisation TrueLayer a échoué.";
    if (reauthorization) await connections.markReauthorizationRequired(userId, connection.id, failureMessage);
    // Le statut et l'appel qui a échoué décident du diagnostic, et ils étaient jetés. « Le
    // consentement a expiré » recouvre trois situations distinctes : un 400 au rafraîchissement
    // du jeton — nos identifiants ou le jeton lui-même sont refusés —, un 401 sur les données —
    // le jeton ne vaut plus rien —, et un 403 — le jeton est valide mais l'accès a été retiré
    // côté banque. Seule la troisième appelle vraiment une reconnexion par l'utilisateur ; les
    // deux autres se règlent de notre côté. Sans ces deux champs, l'écart ne se voit pas.
    const refusal = reauthorization ? (error as BankAuthorizationError).cause : undefined;
    /**
     * Ce qui a échoué, quand ce n'est pas un refus bancaire connu.
     *
     * Les deux champs ci-dessus ne se remplissent que pour un BankAuthorizationError. Toute autre
     * défaillance — une réponse inattendue du fournisseur, une écriture en base refusée, une
     * erreur de programmation — sortait d'ici sans laisser la moindre trace : « outcome: failed,
     * status: undefined, operation: undefined », et l'exception jetée. Constaté sur la première
     * synchronisation d'une connexion neuve, qu'il a fallu instrumenter pour savoir de quoi elle
     * mourait. Le message et le type suffisent à orienter ; la pile va dans le journal d'erreurs.
     */
    const cause = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.info("[bank-sync]", { provider: "truelayer", environment: config.environment, outcome: reauthorization ? "reauthorization_required" : "failed", status: refusal?.status, operation: refusal?.operation, durationMs: Math.round(performance.now() - startedAt), accountCount, ...(reauthorization ? {} : { cause }) });
    if (!reauthorization) console.error("[bank-sync] exception non identifiée", error);
    // Consigné en base et pas seulement dans les journaux : une réautorisation requise n'est pas
    // une exception, personne ne la voit passer, et l'utilisateur constate simplement que ses
    // dépenses cessent de se mettre à jour.
    await recordEvent({
      kind: reauthorization ? "bank_reauthorization_required" : "bank_sync_failed",
      severity: reauthorization ? "warning" : "error",
      userId,
      // La cause est consignée en base aussi : les journaux de l'hébergeur sont éphémères, et
      // c'est précisément une semaine plus tard qu'on cherche pourquoi une synchro a lâché.
      context: { environment: config.environment, accountCount, durationMs: Math.round(performance.now() - startedAt), ...(refusal?.status ? { status: refusal.status } : {}), ...(refusal?.operation ? { operation: refusal.operation } : {}), ...(reauthorization ? {} : { cause: cause.slice(0, 300) }) }
    });
    outcome = { ok: false, reason: reauthorization ? "reauthorization_required" : "sync_failed", message: failureMessage };
  } finally {
    await connections.releaseSyncLock({ id: connection.id, lockId, success: outcome.ok, accountCount, durationMs: Math.round(performance.now() - startedAt), error: failureMessage });
  }

  return outcome;
}
