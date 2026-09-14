import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { isRecurringCurrent, type RecurringSubscription, type StoredSubscription } from "@/lib/subscriptions/detect";

/**
 * La table subscriptions existait depuis le premier schéma et n'a jamais été alimentée.
 *
 * La détection est rejouée puis l'ensemble réécrit, plutôt que fusionné : un abonnement résilié
 * doit disparaître, et un abonnement dont le montant a changé doit refléter le nouveau. Tenir
 * un état incrémental exigerait de distinguer « plus détecté » de « pas encore revu », pour un
 * calcul qui prend de toute façon quelques millisecondes.
 *
 * La table accueille les deux sens. Un salaire n'est pas un abonnement et n'a rien à faire dans
 * la liste affichée sous ce nom — d'où la lecture filtrée — mais il se détecte de la même façon
 * et sert au même calcul de trésorerie.
 */
export class SubscriptionRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async list(userId: string, direction: "debit" | "credit" = "debit") {
    const { data, error } = await this.client.from("subscriptions").select("merchant_name,average_amount,latest_amount,previous_amount,currency,frequency,last_transaction_date").eq("user_id", userId).eq("active", true).eq("direction", direction).order("latest_amount", { ascending: false });
    if (error) throw new Error(`Échec de lecture des abonnements: ${error.message}`);
    return data.map((row) => ({
      merchantName: row.merchant_name,
      latestAmount: Number(row.latest_amount ?? row.average_amount),
      previousAmount: row.previous_amount === null ? null : Number(row.previous_amount),
      averageAmount: Number(row.average_amount),
      currency: row.currency,
      frequency: row.frequency as StoredSubscription["frequency"],
      lastTransactionDate: row.last_transaction_date
    })).filter(item => isRecurringCurrent(item));
  }

  /** Actualise les récurrences et purge les clés disparues (marchand, devise, sens).
   * Les écritures sont séquentielles, sans transaction globale entre plusieurs connexions.
   */
  async replaceAll(userId: string, debits: RecurringSubscription[], credits: RecurringSubscription[] = []) {
    const subscriptions = [...debits.map((item) => ({ item, direction: "debit" as const })), ...credits.map((item) => ({ item, direction: "credit" as const }))];
    if (!subscriptions.length) {
      const { error } = await this.client.from("subscriptions").delete().eq("user_id", userId);
      if (error) throw new Error(`Échec de mise à jour des abonnements: ${error.message}`);
      return 0;
    }
    const { error } = await this.client.from("subscriptions").upsert(subscriptions.map(({ item: subscription, direction }) => ({
      user_id: userId,
      merchant_name: subscription.merchantName,
      average_amount: subscription.averageAmount,
      latest_amount: subscription.latestAmount,
      previous_amount: subscription.previousAmount,
      currency: subscription.currency,
      frequency: subscription.frequency,
      last_transaction_date: subscription.lastTransactionDate,
      active: true,
      direction
    })), { onConflict: "user_id,merchant_name,currency,direction" });
    if (error) throw new Error(`Échec d’enregistrement des abonnements: ${error.message}`);

    // Ce qui n'a pas été détecté cette fois-ci n'existe plus : un abonnement résilié doit
    // disparaître. La suppression vient après l'insertion, et épargne explicitement ce qu'on
    // vient d'écrire — sans quoi elle effacerait le travail d'une synchronisation concurrente.
    const key = (merchant: string, currency: string, direction: string) => JSON.stringify([merchant, currency, direction]);
    const keep = new Set(subscriptions.map(({ item, direction }) => key(item.merchantName, item.currency, direction)));
    const { data: stored, error: readError } = await this.client.from("subscriptions")
      .select("id,merchant_name,currency,direction").eq("user_id", userId);
    if (readError) throw new Error("Échec de lecture des récurrences à actualiser.");
    const stale = (stored ?? []).filter(row => !keep.has(key(row.merchant_name, row.currency, row.direction))).map(row => row.id);
    if (stale.length) {
      const { error: pruneError } = await this.client.from("subscriptions").delete().eq("user_id", userId).in("id", stale);
      if (pruneError) throw new Error("Échec de suppression des anciennes récurrences.");
    }
    return subscriptions.length;
  }
}
