import { createHash } from "node:crypto";
import type { BankAccount, BankConnection } from "@/types/banking";
import type { TrueLayerTokenSet } from "./truelayer-bank-provider";

export interface OAuthStateStore { consumeState(userId: string, state: string): Promise<boolean> }
export interface OAuthTokenStore { saveTokens(connectionId: string, tokens: TrueLayerTokenSet): Promise<void> }
export interface OAuthConnectionStore { upsert(userId: string, providerConnectionId: string, status: "active", accountCount: number, environment: "sandbox" | "live", displayName: string | null): Promise<BankConnection> }
export interface OAuthTrueLayerProvider { exchangeCode(code: string): Promise<TrueLayerTokenSet>; getAccounts(connectionId: string): Promise<BankAccount[]>; getInstitutionName(): Promise<string | null> }

export async function completeTrueLayerCallback(input: { userId: string; code: string; state: string; environment: "sandbox" | "live" }, dependencies: { states: OAuthStateStore; tokens: OAuthTokenStore; connections: OAuthConnectionStore; provider: OAuthTrueLayerProvider }) {
  if (!await dependencies.states.consumeState(input.userId, input.state)) throw new Error("oauth_state_invalid");
  const tokenSet = await dependencies.provider.exchangeCode(input.code);
  const accounts = await dependencies.provider.getAccounts("callback");
  const stableSource = accounts.map((account) => account.providerAccountId).sort().join("|");
  if (!stableSource) throw new Error("no_accounts");
  const providerConnectionId = `v1:${createHash("sha256").update(stableSource).digest("hex").slice(0, 32)}`;
  // L'environnement est transmis explicitement : une connexion live enregistrée comme
  // sandbox reste invisible, le tableau de bord ne montrant que celles de l'environnement courant.
  // Le nom de la banque distingue deux connexions dans l'interface. Il est facultatif : une
  // connexion sans nom fonctionne, une connexion refusée parce que /me a changé, non.
  const displayName = await dependencies.provider.getInstitutionName();
  const connection = await dependencies.connections.upsert(input.userId, providerConnectionId, "active", accounts.length, input.environment, displayName);
  await dependencies.tokens.saveTokens(connection.id, tokenSet);
  return { connection, accounts };
}
