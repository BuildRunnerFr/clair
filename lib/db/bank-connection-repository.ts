import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BankConnection, BankConnectionStatus, BankEnvironment } from "@/types/banking";
import type { Database } from "@/types/supabase";

export class BankConnectionRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async list(userId: string) {
    const { data, error } = await this.client.from("bank_connections").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) throw new Error("Impossible de lire les connexions bancaires.");
    return data.map(mapConnection);
  }

  async findOwned(userId: string, id: string) {
    const { data, error } = await this.client.from("bank_connections").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
    if (error) throw new Error("Impossible de lire la connexion bancaire.");
    return data ? mapConnection(data) : null;
  }

  /** `environment` is passed in rather than assumed: a connection created in live must not be recorded as a sandbox one. */
  async upsert(userId: string, providerConnectionId: string, status: BankConnectionStatus, accountCount: number, environment: BankEnvironment = "sandbox", displayName: string | null = null) {
    // Le nom n'est écrit que si on en a un : une reconnexion dont /me n'a rien renvoyé ne doit
    // pas effacer le nom déjà connu.
    const named = displayName ? { display_name: displayName } : {};
    // La date d'autorisation est réécrite à chaque passage : une reconnexion rouvre la fenêtre
    // pendant laquelle la banque accepte de livrer plus de 90 jours, et c'est elle qui décide de
    // la profondeur du rattrapage.
    const { data, error } = await this.client.from("bank_connections").upsert({ user_id: userId, provider: "truelayer", provider_connection_id: providerConnectionId, environment, status, account_count: accountCount, last_error: null, authorized_at: new Date().toISOString(), ...named }, { onConflict: "user_id,provider,provider_connection_id" }).select("*").single();
    if (error) throw new Error("Impossible d’enregistrer la connexion bancaire.");
    return mapConnection(data);
  }

  /**
   * Renseigne le nom d'une banque connectée avant que celui-ci ne soit capté.
   *
   * Écriture à part, et sans conséquence en cas d'échec : un nom manquant est un détail
   * d'affichage, il ne doit jamais faire échouer la synchronisation qui l'accompagne.
   */
  async setDisplayName(userId: string, id: string, displayName: string): Promise<void> {
    await this.client.from("bank_connections").update({ display_name: displayName }).eq("id", id).eq("user_id", userId);
  }

  async markSynced(userId: string, id: string, accountCount: number) {
    const { error } = await this.client.from("bank_connections").update({ status: "active", account_count: accountCount, last_synced_at: new Date().toISOString(), last_error: null }).eq("id", id).eq("user_id", userId);
    if (error) throw new Error("Impossible de mettre à jour la connexion bancaire.");
  }

  async markError(userId: string, id: string, message: string) {
    await this.client.from("bank_connections").update({ status: "error", last_error: message.slice(0, 180) }).eq("id", id).eq("user_id", userId);
  }

  /**
   * Distinct from markError on purpose: an expired consent is not a fault to retry but a
   * state only the user can leave, by re-authorising. Recording it as an error would keep
   * offering a synchronisation that cannot succeed.
   */
  async markReauthorizationRequired(userId: string, id: string, message: string) {
    await this.client.from("bank_connections").update({ status: "reauthorization_required", last_error: message.slice(0, 180) }).eq("id", id).eq("user_id", userId);
  }

  async trySyncLock(id: string, lockId: string, ttlSeconds = 600): Promise<boolean> {
    const { data, error } = await this.client.rpc("bank_try_sync_lock", { p_connection_id: id, p_lock_id: lockId, p_ttl_seconds: ttlSeconds });
    if (error) throw new Error("Impossible de verrouiller la synchronisation.");
    return data;
  }

  async releaseSyncLock(input: { id: string; lockId: string; success: boolean; accountCount: number; durationMs: number; error?: string }): Promise<void> {
    const { data, error } = await this.client.rpc("bank_release_sync_lock", {
      p_connection_id: input.id,
      p_lock_id: input.lockId,
      p_success: input.success,
      p_account_count: input.accountCount,
      p_duration_ms: input.durationMs,
      p_error: input.error ?? null
    });
    if (error || !data) throw new Error("Impossible de libérer le verrou de synchronisation.");
  }
}

function mapConnection(row: Database["public"]["Tables"]["bank_connections"]["Row"]): BankConnection {
  return { id: row.id, userId: row.user_id, provider: row.provider, providerConnectionId: row.provider_connection_id, displayName: row.display_name, status: row.status as BankConnectionStatus, environment: row.environment as BankEnvironment, accountCount: row.account_count, lastError: row.last_error, syncCursor: row.sync_cursor, lastSyncedAt: row.last_synced_at, authorizedAt: row.authorized_at, lastSyncDurationMs: row.last_sync_duration_ms, createdAt: row.created_at, updatedAt: row.updated_at };
}
