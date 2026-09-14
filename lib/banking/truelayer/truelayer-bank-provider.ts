import { createHash } from "node:crypto";
import { z } from "zod";
import { BankAuthorizationError, type BankProvider } from "@/lib/banking/bank-provider";
import type { BankAccount, BankBalance, BankConnectionResult, BankTransaction } from "@/types/banking";
import type { TrueLayerConfig } from "./config-schema";

/** Seul le nom nous intéresse ; le reste de la réponse est laissé libre à dessein, pour qu'un
 *  champ ajouté ou retiré par l'agrégateur n'invalide pas l'analyse. */
const ME_SHAPE = z.object({
  results: z.array(z.object({ provider: z.object({ display_name: z.string().optional() }).optional() })).default([])
});

const SCOPES = ["info", "accounts", "balance", "transactions", "offline_access"];

const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional(), expires_in: z.coerce.number().positive(), token_type: z.string().optional() });
const accountSchema = z.object({ account_id: z.string().min(1), display_name: z.string().optional(), account_type: z.string().optional(), currency: z.string().length(3) });
const transactionSchema = z.object({ transaction_id: z.string().min(1), normalised_provider_transaction_id: z.string().optional(), provider_transaction_id: z.string().optional(), timestamp: z.string(), description: z.string().optional().default(""), amount: z.number(), currency: z.string().length(3), merchant_name: z.string().nullable().optional(), transaction_classification: z.array(z.string()).optional() });
const resultsSchema = <T extends z.ZodTypeAny>(item: T) => z.object({ results: z.array(item), next_cursor: z.string().optional(), pagination: z.object({ next_cursor: z.string().optional() }).optional() });
const HTTP_TIMEOUT_MS = 20_000;
const TRANSACTION_CONCURRENCY = 4;
const MAX_PAGES = 20;

export type TrueLayerTokenSet = { accessToken: string; refreshToken?: string; expiresAt: Date };
export type TrueLayerFetch = typeof fetch;
export interface TrueLayerMetrics {
  httpCalls: number;
  accountsDurationMs: number;
  transactionRequests: Array<{ accountIndex: number; kind: "settled" | "pending"; durationMs: number; count: number; pages: number }>;
}

export class TrueLayerBankProvider implements BankProvider {
  readonly name = "truelayer";
  private accountCache?: BankAccount[];
  private readonly metrics: TrueLayerMetrics = { httpCalls: 0, accountsDurationMs: 0, transactionRequests: [] };
  // Endpoints come from the config rather than module constants: the sandbox and live hosts
  // differ, and hard-coding either one is how an application ends up pointing at the wrong
  // environment while believing otherwise.
  constructor(private readonly config: TrueLayerConfig, private accessToken?: string, private readonly http: TrueLayerFetch = fetch) {}

  async connect(state: string): Promise<BankConnectionResult> {
    return { connectionId: "pending", authorizationUrl: this.createAuthorizationUrl(state), status: "authorization_required" };
  }

  createAuthorizationUrl(state: string) {
    if (!state) throw new Error("État OAuth manquant.");
    const url = new URL(this.config.endpoints.authorization);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("state", state);
    // Sandbox pins the mock bank; live leaves this unset so TrueLayer shows its own picker,
    // which is where the user selects their actual bank.
    if (this.config.providers) url.searchParams.set("providers", this.config.providers);
    return url.toString();
  }

  async exchangeCode(code: string): Promise<TrueLayerTokenSet> {
    return this.requestToken({ grant_type: "authorization_code", code, redirect_uri: this.config.redirectUri });
  }

  async refreshAccessToken(refreshToken: string): Promise<TrueLayerTokenSet> {
    return this.requestToken({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  async getAccounts(_connectionId: string): Promise<BankAccount[]> {
    if (this.accountCache) return this.accountCache.map((account) => ({ ...account }));
    const startedAt = performance.now();
    const payload = await this.getJson("/accounts", "accounts", resultsSchema(accountSchema));
    this.metrics.accountsDurationMs = Math.round(performance.now() - startedAt);
    this.accountCache = payload.results.map((account) => ({ providerAccountId: account.account_id, name: account.display_name || account.account_type || "Compte TrueLayer", currency: account.currency.toUpperCase() }));
    return this.accountCache.map((account) => ({ ...account }));
  }

  async getBalances(accountIds: string[]): Promise<BankBalance[]> {
    return Promise.all(accountIds.map(async (accountId) => {
      const schema = resultsSchema(z.object({ currency: z.string().length(3), current: z.number(), available: z.number().optional(), overdraft: z.number().optional(), update_timestamp: z.string().optional() }));
      const payload = await this.getJson(`/accounts/${encodeURIComponent(accountId)}/balance`, "balance", schema);
      const balance = payload.results[0];
      if (!balance) throw new Error("Solde TrueLayer indisponible.");
      return { providerAccountId: accountId, currency: balance.currency.toUpperCase(), current: balance.current, available: balance.available, overdraft: balance.overdraft, updatedAt: balance.update_timestamp };
    }));
  }

  async getTransactions(connectionId: string, from: Date, to: Date): Promise<BankTransaction[]> {
    const accounts = await this.getAccounts(connectionId);
    const jobs = accounts.flatMap((account, accountIndex) => [
      ...dateWindows(from, to).map((query) => () => this.getTransactionBatch(account.providerAccountId, accountIndex, query, false)),
      // Les opérations en attente n'ont pas de date de règlement : les borner n'a pas de sens,
      // et l'API rend la même chose avec ou sans bornes. Mesuré.
      () => this.getTransactionBatch(account.providerAccountId, accountIndex, new URLSearchParams(), true)
    ]);
    const batches = await mapLimit(jobs, TRANSACTION_CONCURRENCY, (job) => job());
    const preferred = new Map<string, BankTransaction>();
    for (const transaction of batches.flat()) {
      const current = preferred.get(`${transaction.providerAccountId}:${transaction.providerTransactionId}`);
      if (!current || (current.pending && !transaction.pending)) preferred.set(`${transaction.providerAccountId}:${transaction.providerTransactionId}`, transaction);
    }
    return [...preferred.values()];
  }

  async getConnectionMetadata() {
    return this.getJson("/me", "me", z.record(z.string(), z.unknown()));
  }

  /**
   * Nom de la banque derrière la connexion, tel que l'agrégateur le donne.
   *
   * Toujours en dernier recours : une connexion sans nom reste parfaitement utilisable, alors
   * qu'une connexion refusée parce que /me a changé de forme ne l'est pas. La méthode renvoie
   * donc null sur n'importe quel écart plutôt que de lever.
   */
  async getInstitutionName(): Promise<string | null> {
    try {
      const parsed = ME_SHAPE.safeParse(await this.getConnectionMetadata());
      const name = parsed.success ? parsed.data.results[0]?.provider?.display_name?.trim() : undefined;
      return name ? name.slice(0, 80) : null;
    } catch {
      return null;
    }
  }

  getMetrics(): TrueLayerMetrics {
    return { ...this.metrics, transactionRequests: this.metrics.transactionRequests.map((item) => ({ ...item })) };
  }

  /**
   * Révoque le consentement auprès de la banque.
   *
   * Supprimer nos jetons ne suffit pas : l'autorisation continue d'exister côté banque, où
   * l'utilisateur la verrait encore dans la liste des accès accordés. Une suppression de compte
   * qui laisse l'accès ouvert n'en est pas une.
   *
   * Renvoie un booléen plutôt que de lever : la révocation est faite au mieux, et son échec ne
   * doit pas empêcher un utilisateur d'effacer son compte — ce serait le retenir contre son gré
   * pour un motif technique. Le consentement expirera de lui-même.
   */
  async revokeConsent(): Promise<boolean> {
    if (!this.accessToken) return false;
    try {
      this.metrics.httpCalls++;
      const response = await this.http(`${this.config.endpoints.data}/me`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${this.accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async getTransactionBatch(accountId: string, accountIndex: number, query: URLSearchParams, pending: boolean) {
    const startedAt = performance.now();
    const suffix = pending ? "/transactions/pending" : "/transactions";
    const transactions: z.output<typeof transactionSchema>[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const pageQuery = new URLSearchParams(query);
      if (cursor) pageQuery.set("cursor", cursor);
      const payload = await this.getJson(`/accounts/${encodeURIComponent(accountId)}${suffix}?${pageQuery}`, suffix.includes("pending") ? "transactions_pending" : "transactions", resultsSchema(transactionSchema));
      transactions.push(...z.array(transactionSchema).parse(payload.results));
      cursor = payload.next_cursor ?? payload.pagination?.next_cursor;
      pages++;
      if (pages >= MAX_PAGES && cursor) throw new Error("Pagination TrueLayer trop profonde.");
    } while (cursor);
    this.metrics.transactionRequests.push({ accountIndex, kind: pending ? "pending" : "settled", durationMs: Math.round(performance.now() - startedAt), count: transactions.length, pages });
    return transactions.map((transaction): BankTransaction => ({
      providerTransactionId: stableTransactionId(accountId, transaction),
      providerAccountId: accountId,
      merchantName: transaction.merchant_name ?? null,
      description: transaction.description || "Transaction TrueLayer",
      amount: transaction.amount,
      currency: transaction.currency.toUpperCase(),
      transactionDate: new Date(transaction.timestamp).toISOString(),
      pending,
      rawData: {
        source: "truelayer",
        safeReference: transaction.normalised_provider_transaction_id || transaction.provider_transaction_id || transaction.transaction_id,
        // Classification fournie par la banque, jusqu'ici récupérée puis jetée. Ce n'est pas
        // une donnée personnelle mais une étiquette de catégorie, et c'est le signal le moins
        // cher pour catégoriser : ni appel externe, ni exposition supplémentaire.
        ...(transaction.transaction_classification?.length ? { providerClassification: transaction.transaction_classification.join(" > ") } : {})
      }
    }));
  }

  private async requestToken(extra: Record<string, string>): Promise<TrueLayerTokenSet> {
    const body = new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, ...extra });
    this.metrics.httpCalls++;
    const response = await this.http(this.config.endpoints.token, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, cache: "no-store", signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    if (!response.ok) throw tokenError(response.status, await response.text().catch(() => ""));
    const token = tokenSchema.parse(await response.json());
    this.accessToken = token.access_token;
    return { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: new Date(Date.now() + token.expires_in * 1000) };
  }

  private async getJson<T>(path: string, operation: string, schema: z.ZodType<T>): Promise<T> {
    if (!this.accessToken) throw new Error("Access token TrueLayer absent.");
    this.metrics.httpCalls++;
    const response = await this.http(`${this.config.endpoints.data}${path}`, { headers: { authorization: `Bearer ${this.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    if (!response.ok) {
      /**
       * Le corps de la réponse est lu avant de jeter.
       *
       * TrueLayer y met le motif exact du refus — quel paramètre, quelle borne, quel scope
       * manquant. On le jetait sans le lire, si bien qu'un 400 sur les transactions ne disait
       * rien de plus que « 400 » : il a fallu instrumenter le code pour diagnostiquer un échec
       * de première synchronisation. Le corps ne contient jamais le jeton, qui voyage en
       * en-tête ; il est tronqué par précaution et ne remonte pas jusqu'à l'utilisateur.
       */
      const detail = await response.text().then((body) => body.slice(0, 300)).catch(() => "");
      if (detail) console.warn("[truelayer] refus de l'API", { operation, status: response.status, detail });
      throw externalError(`Requête Data API TrueLayer (${operation})`, response.status, `data_${operation}`);
    }
    return schema.parse(await response.json());
  }
}

export async function mapLimit<T, R>(items: T[], concurrency: number, operation: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await operation(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, worker));
  return results;
}

function dateOnly(date: Date) { return date.toISOString().slice(0, 10); }

/**
 * Découpe une période en fenêtres d'un an au plus.
 *
 * L'API refuse une plage plus longue, et le refus est un 400 « invalid_date_range » qui fait
 * échouer la synchronisation entière — pas une troncature silencieuse. La borne a été mesurée
 * contre le fournisseur : 365 jours passent et rendent 1 792 opérations, 366 sont refusés.
 *
 * C'est ce qui rendait la reprise d'historique profond inopérante depuis toujours : elle
 * demandait vingt-quatre mois en une fois, donc sept cent trente jours, donc rien. Et comme
 * elle ne s'exécute que dans les quelques minutes suivant l'autorisation, l'échec consommait la
 * seule occasion d'obtenir cet historique — la banque le refuse ensuite.
 */
export const MAX_RANGE_DAYS = 365;

export function dateWindows(from: Date, to: Date): URLSearchParams[] {
  const windows: URLSearchParams[] = [];
  let start = new Date(from);
  // « <= » et non « < » : avec l'inégalité stricte, une période dont la longueur tombe juste sur
  // un multiple de la fenêtre perdait son dernier jour — c'est-à-dire, sur une synchronisation
  // quotidienne, les opérations d'aujourd'hui. Trouvé par le test, pas à la relecture.
  while (start <= to) {
    const end = new Date(Math.min(start.getTime() + (MAX_RANGE_DAYS - 1) * 86_400_000, to.getTime()));
    windows.push(new URLSearchParams({ from: dateOnly(start), to: dateOnly(end) }));
    start = new Date(end.getTime() + 86_400_000);
  }
  // Une période vide ou inversée doit tout de même produire une requête : c'est au fournisseur
  // de dire qu'elle ne convient pas, pas à nous de rendre zéro opération en silence.
  return windows.length ? windows : [new URLSearchParams({ from: dateOnly(from), to: dateOnly(to) })];
}

/**
 * `operation` se lit dans un message, `code` se consigne dans le journal.
 *
 * Les deux sont nécessaires et ne peuvent pas être la même chaîne : le journal n'accepte que
 * des formes de code — courtes, sans espace — précisément pour qu'un libellé bancaire recopié
 * ne puisse jamais s'y glisser. Une phrase française y était donc silencieusement écartée, et
 * l'échec se consignait sans dire ni quel appel avait échoué ni avec quel statut.
 */
function externalError(operation: string, status: number, code: string) {
  // 401/403 sur la Data API : le jeton ne vaut plus rien, ou l'accès a été retiré côté banque.
  if (status === 401 || status === 403) {
    return new BankAuthorizationError("Le consentement bancaire a expiré ou a été révoqué. Reconnectez votre banque.", { status, operation: code });
  }
  return new Error(`${operation} impossible (${status}).`);
}

/**
 * Un refus au guichet des jetons, et ce qu'il faut en conclure.
 *
 * TrueLayer répond 400 à deux situations que rien ne rapproche, et dont le corps de la réponse
 * porte seul la distinction :
 *
 *   invalid_grant  — le refresh token est mort. Le consentement est terminé, l'utilisateur doit
 *                    reconnecter sa banque, et lui seul peut le faire.
 *   invalid_client — c'est l'application que TrueLayer refuse. Aucune reconnexion n'y changera
 *                    quoi que ce soit : la variable d'environnement est fausse, ou les
 *                    identifiants du bac à sable ont été déployés en production.
 *
 * Les deux étaient traduits par « reconnectez votre banque ». Un identifiant d'application
 * erroné aurait donc marqué toutes les connexions comme à réautoriser et envoyé chaque
 * utilisateur refaire un parcours bancaire qui aurait échoué à l'identique — l'incident étant
 * pendant ce temps invisible, puisque tout le système l'aurait imputé aux utilisateurs.
 */
function tokenError(status: number, body: string) {
  const code = /"error"\s*:\s*"([a-z_]{1,40})"/.exec(body)?.[1];
  if (code === "invalid_client" || code === "unauthorized_client") {
    return new Error(`TrueLayer refuse les identifiants de l’application (${code}). Vérifiez la configuration, ce n’est pas à l’utilisateur de reconnecter sa banque.`);
  }
  if (status === 400 || status === 401) {
    return new BankAuthorizationError("Le consentement bancaire a expiré ou a été révoqué. Reconnectez votre banque.", { status, operation: code ? `token_${code}` : "token_exchange" });
  }
  return new Error(`Échange de token TrueLayer impossible (${status}).`);
}

export function stableTransactionId(accountId: string, transaction: { normalised_provider_transaction_id?: string; provider_transaction_id?: string; transaction_id: string; timestamp?: string; amount?: number; description?: string }) {
  const stable = transaction.normalised_provider_transaction_id || transaction.provider_transaction_id;
  if (stable) return stable;
  return `tl_${createHash("sha256").update([accountId, transaction.transaction_id, transaction.timestamp, transaction.amount, transaction.description].join("|")).digest("hex")}`;
}
