import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { decryptToken, encryptToken, hashOAuthState, randomOAuthState } from "@/lib/banking/truelayer/crypto";

export interface TokenSecret { accessToken: string; refreshToken?: string; expiresAt: Date }

export class BankSecretRepository {
  constructor(private readonly admin: SupabaseClient<Database>) {}

  async createState(userId: string) {
    const state = randomOAuthState();
    const { error } = await this.admin.rpc("bank_create_oauth_state", { p_state_hash: hashOAuthState(state), p_user_id: userId, p_expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
    if (error) throw new Error("Impossible de préparer la connexion bancaire.");
    return state;
  }

  async consumeState(userId: string, state: string) {
    const { data, error } = await this.admin.rpc("bank_consume_oauth_state", { p_state_hash: hashOAuthState(state), p_user_id: userId });
    if (error) throw new Error("Impossible de valider l’état OAuth.");
    return data;
  }

  async saveTokens(connectionId: string, tokens: TokenSecret) {
    const { error } = await this.admin.rpc("bank_save_connection_secret", { p_connection_id: connectionId, p_access_token_ciphertext: encryptToken(tokens.accessToken), p_refresh_token_ciphertext: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null, p_access_token_expires_at: tokens.expiresAt.toISOString() });
    if (error) throw new Error("Impossible de stocker les credentials bancaires.");
  }

  async getTokens(connectionId: string): Promise<TokenSecret | null> {
    const { data, error } = await this.admin.rpc("bank_get_connection_secret", { p_connection_id: connectionId });
    if (error) throw new Error("Impossible de charger les credentials bancaires.");
    const secret = data[0];
    if (!secret) return null;
    return { accessToken: decryptToken(secret.access_token_ciphertext), refreshToken: secret.refresh_token_ciphertext ? decryptToken(secret.refresh_token_ciphertext) : undefined, expiresAt: new Date(secret.access_token_expires_at) };
  }
}
