export type Currency = string;

export interface BankConnectionResult {
  connectionId: string;
  authorizationUrl?: string;
  status: "ready" | "authorization_required";
}

export type BankConnectionStatus = "pending" | "active" | "reauthorization_required" | "disabled" | "error";
export type BankEnvironment = "sandbox" | "live";

export interface BankConnection {
  id: string;
  userId: string;
  provider: string;
  providerConnectionId: string;
  /** Nom de la banque. Null pour une connexion établie avant que l'agrégateur ne soit interrogé. */
  displayName: string | null;
  status: BankConnectionStatus;
  environment: BankEnvironment;
  accountCount: number;
  lastError: string | null;
  syncCursor: string | null;
  lastSyncedAt: string | null;
  /**
   * Dernière authentification de l'utilisateur chez sa banque.
   *
   * Elle décide de la profondeur d'historique accessible : les deux ans que la directive
   * autorise ne le sont que pendant les minutes qui la suivent. Null pour les connexions
   * antérieures à son suivi, ce qui vaut fenêtre fermée.
   */
  authorizedAt: string | null;
  lastSyncDurationMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BankTransactionPage {
  transactions: BankTransaction[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface InternalTransactionInput {
  providerTransactionId: string;
  providerAccountId: string;
  merchantName: string;
  description: string;
  amount: number;
  currency: Currency;
  transactionDate: string;
  pending: boolean;
  safeMetadata?: Record<string, string | number | boolean>;
}

export interface BankAccount {
  providerAccountId: string;
  name: string;
  currency: Currency;
}

export interface BankBalance {
  providerAccountId: string;
  currency: Currency;
  current: number;
  available?: number;
  overdraft?: number;
  updatedAt?: string;
}

export interface BankTransaction {
  providerTransactionId: string;
  providerAccountId: string;
  merchantName: string | null;
  description: string;
  amount: number;
  currency: Currency;
  transactionDate: string;
  pending: boolean;
  rawData?: Record<string, unknown>;
}

export interface NormalizedTransaction extends BankTransaction {
  merchantName: string;
  category: string;
  subcategory: string;
}

export interface CategoryResult {
  category: string;
  subcategory: string;
  source: "manual" | "rule" | "default" | "ai" | "uncategorized";
  confidence: number | null;
  reason?: string;
}
