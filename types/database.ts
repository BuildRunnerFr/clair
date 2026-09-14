export interface Account {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  name: string;
  currency: string;
  balanceCurrent: number | null;
  balanceAvailable: number | null;
  balanceOverdraft: number | null;
  balanceUpdatedAt: string | null;
  createdAt: string;
}

export interface MerchantRule {
  id?: string;
  userId: string;
  merchantPattern: string;
  category: string;
  subcategory: string;
  normalizedMerchant?: string;
  source?: "manual" | "ai" | "default";
  confidence?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface StoredTransaction {
  id?: string;
  userId: string;
  accountId: string;
  providerTransactionId: string;
  merchantName: string;
  description: string;
  amount: number;
  currency: string;
  transactionDate: string;
  category: string;
  subcategory: string;
  pending: boolean;
  /** Montant converti dans la devise principale, figé au taux du jour de l'opération. */
  amountBase?: number | null;
  baseCurrency?: string | null;
  fxRate?: number | null;
  fxRateDate?: string | null;
  rawData?: Record<string, unknown>;
  categorySource?: "default" | "rule" | "ai" | "manual" | "uncategorized";
  categoryConfidence?: number | null;
  categorizedAt?: string | null;
}

export interface Budget {
  id: string;
  userId: string;
  category: string;
  currency: string;
  monthlyLimit: number;
  createdAt: string;
  updatedAt: string;
}

/** Ce qu'une catégorie coûte habituellement, pour juger d'une limite avant de la fixer. */
export interface CategoryHistory {
  category: string;
  averageMonthly: number;
  /** Sur combien de mois révolus la moyenne porte : une moyenne sur un seul mois ne vaut pas grand-chose. */
  monthsCounted: number;
}

export interface BudgetStatus {
  budgetId: string | null;
  category: string;
  currency: string;
  monthlyLimit: number | null;
  spent: number;
  remaining: number | null;
  percentageUsed: number | null;
}
